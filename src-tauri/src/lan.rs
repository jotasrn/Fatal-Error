//! Native Rust LAN TCP/UDP server, discovery, and framing for Fatal Error (Tauri 2.0).
//! Wire-compatible with `electron/lan.cjs` (4-byte big-endian length prefix + JSON).

use serde::Serialize;
use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::{mpsc, Mutex};

pub const LAN_PORT_BASE: u16 = 41230;
pub const LAN_PORT_COUNT: u16 = 8;
pub const DISCOVERY_PORT: u16 = 41229;
pub const MAX_FRAME_BYTES: usize = 256 * 1024;
const LAN_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

pub fn is_valid_private_lan_ip(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 10 || (a == 172 && (16..=31).contains(&b)) || (a == 192 && b == 168)
}

pub fn encode_lan_code(ip: Ipv4Addr, port_offset: u8) -> Option<String> {
    if !is_valid_private_lan_ip(ip) || (port_offset as u16) >= LAN_PORT_COUNT {
        return None;
    }
    let [a, b, c, d] = ip.octets();
    let ip_num = u32::from_be_bytes([a, b, c, d]) as u64;
    let mut val = (ip_num << 3) | ((port_offset & 0x07) as u64);
    let mut chars = [b'A'; 8];
    chars[0] = b'G';
    for i in (1..=7).rev() {
        chars[i] = LAN_ALPHABET[(val & 31) as usize];
        val >>= 5;
    }
    String::from_utf8(chars.to_vec()).ok()
}

pub fn decode_lan_code(code: &str) -> Option<(Ipv4Addr, u16)> {
    let s = code.trim().to_ascii_uppercase();
    let bytes = s.as_bytes();
    if bytes.len() != 8 || bytes[0] != b'G' {
        return None;
    }
    let mut val: u64 = 0;
    for &ch in &bytes[1..8] {
        let idx = LAN_ALPHABET.iter().position(|&c| c == ch)? as u64;
        val = (val << 5) | idx;
    }
    let port_offset = (val & 0x07) as u16;
    if port_offset >= LAN_PORT_COUNT {
        return None;
    }
    let ip_num = (val >> 3) as u32;
    let ip = Ipv4Addr::from(ip_num);
    if !is_valid_private_lan_ip(ip) {
        return None;
    }
    Some((ip, LAN_PORT_BASE + port_offset))
}

pub fn detect_lan_ipv4() -> Ipv4Addr {
    if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("10.255.255.255:1").is_ok() {
            if let Ok(SocketAddr::V4(addr)) = sock.local_addr() {
                if is_valid_private_lan_ip(*addr.ip()) {
                    return *addr.ip();
                }
            }
        }
    }
    Ipv4Addr::new(127, 0, 0, 1)
}

#[derive(Clone, Serialize)]
pub struct HostInfo {
    pub code: String,
    pub ip: String,
    pub port: u16,
    #[serde(rename = "selfId")]
    pub self_id: String,
}

#[derive(Clone, Serialize)]
struct PeerJoinEvent {
    key: String,
}

#[derive(Clone, Serialize)]
struct PeerLeaveEvent {
    key: String,
}

#[derive(Clone, Serialize)]
struct PeerDataEvent {
    key: String,
    msg: serde_json::Value,
}

#[derive(Default)]
pub struct LanState {
    pub peers: Arc<Mutex<HashMap<String, mpsc::Sender<Vec<u8>>>>>,
    pub stop_tx: Arc<Mutex<Option<tokio::sync::watch::Sender<bool>>>>,
}

fn frame_msg(msg: &serde_json::Value) -> Option<Vec<u8>> {
    let body = serde_json::to_vec(msg).ok()?;
    if body.len() > MAX_FRAME_BYTES {
        return None;
    }
    let mut out = Vec::with_capacity(4 + body.len());
    out.extend_from_slice(&(body.len() as u32).to_be_bytes());
    out.extend_from_slice(&body);
    Some(out)
}

async fn handle_tcp_conn(
    stream: TcpStream,
    peer_key: String,
    app: AppHandle,
    peers: Arc<Mutex<HashMap<String, mpsc::Sender<Vec<u8>>>>>,
) {
    let (mut rd, mut wr) = stream.into_split();
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(128);
    peers.lock().await.insert(peer_key.clone(), tx);
    let _ = app.emit("lan:peer-join", PeerJoinEvent { key: peer_key.clone() });

    let write_task = tokio::spawn(async move {
        while let Some(buf) = rx.recv().await {
            if wr.write_all(&buf).await.is_err() {
                break;
            }
        }
    });

    let mut len_buf = [0u8; 4];
    loop {
        if rd.read_exact(&mut len_buf).await.is_err() {
            break;
        }
        let len = u32::from_be_bytes(len_buf) as usize;
        if len == 0 || len > MAX_FRAME_BYTES {
            break;
        }
        let mut body = vec![0u8; len];
        if rd.read_exact(&mut body).await.is_err() {
            break;
        }
        if let Ok(msg) = serde_json::from_slice::<serde_json::Value>(&body) {
            let _ = app.emit(
                "lan:peer-data",
                PeerDataEvent {
                    key: peer_key.clone(),
                    msg,
                },
            );
        }
    }

    write_task.abort();
    peers.lock().await.remove(&peer_key);
    let _ = app.emit("lan:peer-leave", PeerLeaveEvent { key: peer_key });
}

pub async fn start_host(app: AppHandle, state: &LanState, host_name: String) -> Result<HostInfo, String> {
    stop_all(state).await;

    let mut bound = None;
    for offset in 0..LAN_PORT_COUNT {
        let port = LAN_PORT_BASE + offset;
        if let Ok(listener) = TcpListener::bind(("0.0.0.0", port)).await {
            bound = Some((listener, port, offset as u8));
            break;
        }
    }
    let (listener, port, offset) = bound.ok_or_else(|| "Nenhuma porta LAN disponível".to_string())?;
    let ip = detect_lan_ipv4();
    let code = encode_lan_code(ip, offset).unwrap_or_else(|| format!("G{:07}", port));
    let self_id = format!("rust-host-{}", port);

    let (stop_tx, mut stop_rx) = tokio::sync::watch::channel(false);
    *state.stop_tx.lock().await = Some(stop_tx);

    let peers = state.peers.clone();
    let app_accept = app.clone();
    tokio::spawn(async move {
        let mut next_id: u64 = 1;
        loop {
            tokio::select! {
                _ = stop_rx.changed() => break,
                res = listener.accept() => {
                    if let Ok((stream, addr)) = res {
                        let key = format!("peer-{}-{}", addr.ip(), next_id);
                        next_id += 1;
                        tokio::spawn(handle_tcp_conn(stream, key, app_accept.clone(), peers.clone()));
                    }
                }
            }
        }
    });

    // UDP LAN discovery responder
    let code_udp = code.clone();
    let ip_str = ip.to_string();
    let mut stop_udp = state.stop_tx.lock().await.as_ref().unwrap().subscribe();
    tokio::spawn(async move {
        if let Ok(udp) = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)).await {
            let mut buf = [0u8; 512];
            loop {
                tokio::select! {
                    _ = stop_udp.changed() => break,
                    res = udp.recv_from(&mut buf) => {
                        if let Ok((n, from)) = res {
                            if &buf[..n] == b"FATAL_ERROR_DISCOVER" {
                                let reply = serde_json::json!({
                                    "code": code_udp,
                                    "hostName": host_name,
                                    "ip": ip_str,
                                    "port": port,
                                });
                                if let Ok(bytes) = serde_json::to_vec(&reply) {
                                    let _ = udp.send_to(&bytes, from).await;
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    Ok(HostInfo {
        code,
        ip: ip.to_string(),
        port,
        self_id,
    })
}

pub async fn join_host(app: AppHandle, state: &LanState, target: String) -> Result<HostInfo, String> {
    stop_all(state).await;
    let (ip, port) = decode_lan_code(&target)
        .ok_or_else(|| "Código LAN inválido".to_string())?;
    let addr = SocketAddrV4::new(ip, port);
    let stream = TcpStream::connect(addr).await.map_err(|e| format!("Falha ao conectar LAN: {e}"))?;
    let host_key = format!("host-{ip}-{port}");
    tokio::spawn(handle_tcp_conn(stream, host_key.clone(), app, state.peers.clone()));
    Ok(HostInfo {
        code: target,
        ip: ip.to_string(),
        port,
        self_id: "rust-client".to_string(),
    })
}

pub async fn send_to_peer(state: &LanState, key: &str, msg: serde_json::Value) -> Result<(), String> {
    let bytes = frame_msg(&msg).ok_or_else(|| "Mensagem inválida ou muito grande".to_string())?;
    let peers = state.peers.lock().await;
    if let Some(tx) = peers.get(key) {
        let _ = tx.try_send(bytes);
    }
    Ok(())
}

pub async fn stop_all(state: &LanState) {
    if let Some(tx) = state.stop_tx.lock().await.take() {
        let _ = tx.send(true);
    }
    state.peers.lock().await.clear();
}

pub async fn discover_hosts(timeout_ms: u64) -> Vec<serde_json::Value> {
    let mut found = Vec::new();
    let Ok(udp) = UdpSocket::bind("0.0.0.0:0").await else {
        return found;
    };
    let _ = udp.set_broadcast(true);
    let _ = udp
        .send_to(b"FATAL_ERROR_DISCOVER", ("255.255.255.255", DISCOVERY_PORT))
        .await;
    let deadline = tokio::time::Instant::now()
        + std::time::Duration::from_millis(timeout_ms.clamp(80, 2000));
    let mut buf = [0u8; 512];
    let mut seen = std::collections::HashSet::new();
    while let Ok(Ok((n, _from))) = tokio::time::timeout_at(deadline, udp.recv_from(&mut buf)).await {
        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&buf[..n]) {
            if let Some(code) = v.get("code").and_then(|c| c.as_str()) {
                if seen.insert(code.to_string()) {
                    found.push(v);
                }
            }
        }
    }
    found
}
