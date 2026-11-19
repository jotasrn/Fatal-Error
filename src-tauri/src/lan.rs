//! Native Rust LAN TCP/UDP framing & 8-character `G...` room code codec for Fatal Error.
//! Compatible wire-for-wire with `electron/lan.cjs` and `electron/security.cjs`.

use std::net::Ipv4Addr;

pub const LAN_PORT_BASE: u16 = 41230;
pub const LAN_PORT_COUNT: u16 = 4;
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

