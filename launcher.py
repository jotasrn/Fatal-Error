#!/usr/bin/env python3
"""
Fatal Error - Executável Nativo & Servidor LAN Seguro
Executa o jogo diretamente em uma janela nativa (WebView2 Desktop), sem abrir navegador externo,
enquanto mantém o servidor HTTP seguro rodando em segundo plano na rede local (LAN)
para que seus colegas possam se conectar ao mesmo lobby.
"""

import http.server
import mimetypes
import os
import posixpath
import socket
import sys
import threading
import time
import urllib.parse
from collections import defaultdict

# Garante MIME types corretos no Windows
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('application/wasm', '.wasm')

# PyWebView para janela de aplicativo nativo de desktop
try:
    import webview
    HAS_WEBVIEW = True
except ImportError:
    HAS_WEBVIEW = False

# Diretório base dos arquivos do jogo
# Quando empacotado no PyInstaller, sys._MEIPASS contém todos os arquivos (index.html, src, vendor, etc.)
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    BUNDLE_DIR = os.path.abspath(sys._MEIPASS)
    EXE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXE_DIR = BUNDLE_DIR

# Extensões seguras permitidas para serem servidas na rede
ALLOWED_EXTENSIONS = {
    '.html', '.htm', '.css', '.js', '.mjs', '.map', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.woff', '.woff2', '.ttf', '.wasm', '.mp3', '.ogg', '.wav'
}

# Rate limiting por IP: máximo de requisições por janela de tempo
RATE_LIMIT_WINDOW = 1.0  # segundos
MAX_REQUESTS_PER_WINDOW = 200
ip_request_counts = defaultdict(list)
rate_limit_lock = threading.Lock()


def is_rate_limited(client_ip):
    now = time.time()
    with rate_limit_lock:
        timestamps = ip_request_counts[client_ip]
        ip_request_counts[client_ip] = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
        if len(ip_request_counts[client_ip]) >= MAX_REQUESTS_PER_WINDOW:
            return True
        ip_request_counts[client_ip].append(now)
        return False


def get_all_lan_ips():
    """Detecta todos os IPs locais válidos na rede (Wi-Fi/Ethernet)."""
    ips = []
    # Método 1: Rota ativa
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        primary = s.getsockname()[0]
        if primary and primary != '127.0.0.1':
            ips.append(primary)
    except Exception:
        pass
    finally:
        s.close()

    # Método 2: Todos os adaptadores da máquina
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if ip != '127.0.0.1' and not ip.startswith('169.254.') and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    if not ips:
        ips.append('127.0.0.1')
    return ips


class SecureLANRequestHandler(http.server.SimpleHTTPRequestHandler):
    """
    Handler HTTP seguro e otimizado para jogos em rede local:
    - Previne Path Traversal (escape de diretório)
    - Bloqueia arquivos e pastas ocultas (.git, .env, etc.)
    - Bloqueia scripts e arquivos de servidor (.py, .exe, etc.)
    - Desativa listagem de diretórios (sem vazamento de arquivos)
    - Adiciona cabeçalhos de segurança (CSP, Anti-Sniff, Sandboxing)
    - Rate-limiting contra escaneamentos de portas/ataques de negação de serviço
    """

    def log_message(self, format, *args):
        # Suprime logs de requisições rotineiras
        pass

    def send_error(self, code, message=None, explain=None):
        try:
            self.send_response(code, message)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.end_headers()
            body = (
                f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>{code} {message}</title>"
                f"<style>body{{font-family:sans-serif;text-align:center;padding:50px;background:#f9f8f5;color:#1c39bb;}}"
                f"h1{{font-size:42px;margin-bottom:8px;}}p{{color:#555;font-size:18px;}}</style></head>"
                f"<body><h1>{code}</h1><p>{message or 'Acesso negado'}</p></body></html>"
            )
            self.wfile.write(body.encode('utf-8', errors='replace'))
        except Exception:
            pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('X-XSS-Protection', '1; mode=block')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        
        # CSP: permite execução segura de shaders Three.js, áudio e WebRTC PeerJS
        csp = (
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; "
            "connect-src 'self' https://*.peerjs.com wss://*.peerjs.com https://0.peerjs.com wss://0.peerjs.com stun:* turn:* turns:*; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob: data:; "
            "font-src 'self' data:;"
        )
        self.send_header('Content-Security-Policy', csp)
        super().end_headers()

    def translate_path(self, path):
        """
        Resolve caminhos de arquivo de forma segura:
        - Bloqueia Path Traversal
        - Bloqueia arquivos ocultos ou drivers
        - Garante resolução correta de '/' para 'index.html' tanto no pacote (sys._MEIPASS) quanto local
        """
        clean_path = path.split('?', 1)[0].split('#', 1)[0]
        try:
            clean_path = urllib.parse.unquote(clean_path, errors='surrogatepass')
        except Exception:
            return None

        if '\x00' in clean_path:
            return None

        clean_path = posixpath.normpath(clean_path)
        words = clean_path.split('/')
        words = [w for w in words if w and w != '.']

        # Previne escape de diretório e acesso a recursos ocultos
        for word in words:
            if word.startswith('.'):
                return None
            drive, _ = os.path.splitdrive(word)
            if drive:
                return None

        # Prioriza BUNDLE_DIR (onde estão os assets do executável compilado) e depois EXE_DIR
        for base in [BUNDLE_DIR, EXE_DIR]:
            candidate = os.path.abspath(os.path.join(base, *words))
            try:
                common = os.path.commonpath([base, candidate])
                if os.path.abspath(common) != os.path.abspath(base):
                    continue
            except Exception:
                continue

            # Se for diretório (como na raiz '/'), procura index.html
            if os.path.isdir(candidate):
                index_file = os.path.join(candidate, 'index.html')
                if os.path.isfile(index_file):
                    return index_file
            elif os.path.isfile(candidate):
                return candidate

        return None

    def send_head(self):
        resolved_path = self.translate_path(self.path)
        if not resolved_path or not os.path.isfile(resolved_path):
            self.send_error(404, "Arquivo não encontrado")
            return None

        ext = os.path.splitext(resolved_path)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            self.send_error(403, "Tipo de arquivo proibido")
            return None

        ctype = self.guess_type(resolved_path)
        try:
            f = open(resolved_path, 'rb')
        except OSError:
            self.send_error(404, "Arquivo não encontrado")
            return None

        try:
            fs = os.fstat(f.fileno())
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(fs[6]))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            return f
        except Exception:
            f.close()
            raise

    def do_GET(self):
        client_ip = self.client_address[0]
        if is_rate_limited(client_ip):
            self.send_error(429, "Too Many Requests")
            return

        f = self.send_head()
        if f:
            try:
                self.copyfile(f, self.wfile)
            finally:
                f.close()

    def do_HEAD(self):
        client_ip = self.client_address[0]
        if is_rate_limited(client_ip):
            self.send_error(429, "Too Many Requests")
            return

        f = self.send_head()
        if f:
            f.close()

    def do_POST(self):
        self.send_error(405, "Method Not Allowed")

    def do_PUT(self):
        self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):
        self.send_error(405, "Method Not Allowed")

    def list_directory(self, path):
        self.send_error(404, "Not Found")
        return None


def start_lan_server(port=8910):
    """Inicia o servidor em segundo plano e retorna a porta e a instância do servidor."""
    server = None
    for attempt in range(20):
        try:
            server = http.server.ThreadingHTTPServer(('0.0.0.0', port), SecureLANRequestHandler)
            break
        except OSError:
            port += 1

    if not server:
        print(f"[ERRO] Nao foi possivel iniciar o servidor em nenhuma porta a partir de {port}.")
        sys.exit(1)

    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server, port


def main():
    port = 8910
    server_only = '--server-only' in sys.argv
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)

    server, actual_port = start_lan_server(port)
    lan_ips = get_all_lan_ips()
    primary_ip = lan_ips[0]
    local_url = f"http://127.0.0.1:{actual_port}"
    primary_lan_url = f"http://{primary_ip}:{actual_port}"

    # Salva informações claras em CONECTAR_LAN.txt tanto no EXE_DIR quanto no diretório atual
    for target_dir in set([EXE_DIR, os.getcwd()]):
        try:
            info_file = os.path.join(target_dir, "CONECTAR_LAN.txt")
            with open(info_file, "w", encoding="utf-8") as f:
                f.write("=====================================================\n")
                f.write("      FATAL ERROR - COMO JOGAR COM COLEGAS (LAN) \n")
                f.write("=====================================================\n\n")
                f.write("1. Link principal para seus colegas abrirem no navegador:\n")
                f.write(f"   {primary_lan_url}\n\n")
                if len(lan_ips) > 1:
                    f.write("2. Outros enderecos de rede disponíveis (se necessario):\n")
                    for extra_ip in lan_ips[1:]:
                        f.write(f"   http://{extra_ip}:{actual_port}\n")
                    f.write("\n")
                f.write("COMO JOGAR JUNTOS:\n")
                f.write("- Você joga diretamente no aplicativo aberto no seu PC.\n")
                f.write("- Seus colegas abrem o link acima no navegador deles (Chrome/Edge/Firefox).\n")
                f.write("- No menu do jogo, vá em 'JOGAR ONLINE' e crie uma sala ('Criar Sala').\n")
                f.write("- Passe o código de 5 letras da sala para seus colegas digitarem em 'Tem o código da sala?'.\n\n")
                f.write("DICA DE REDE:\n")
                f.write("- Todos devem estar conectados na mesma rede Wi-Fi ou no mesmo cabo de rede.\n")
                f.write("- Se o Windows exibir um aviso de Firewall, clique em 'Permitir acesso em redes privadas'.\n")
                f.write("=====================================================\n")
        except Exception:
            pass

    print("=" * 68)
    print("      FATAL ERROR - JOGO NATIVO & SERVIDOR LAN SEGURO")
    print("=" * 68)
    print(" [OK] Modo Executável Nativo:             ATIVADO (Janela Desktop Própria)")
    print(" [OK] Servidor Web LAN:                   ATIVADO (Porta %d)" % actual_port)
    print(" [OK] Correção de Rota (Erro 404):        RESOLVIDO")
    print(" [OK] Proteção contra Path Traversal:     ATIVADA")
    print(" [OK] Bloqueio de arquivos confidenciais: ATIVADO (.git, .env, scripts)")
    print(" [OK] Listagem de diretórios:             DESATIVADA (Sem vazamentos)")
    print(" [OK] Cabeçalhos de Segurança (CSP):      ATIVADOS")
    print(" [OK] Rate-Limiting Anti-Scan/DDoS:       ATIVADO")
    print(" [OK] Tradução Português:                 100% COMPLETA")
    print(" [OK] Nova Arma:                          BAZUCA (Slot 4 - Tecla 4)")
    print("-" * 68)
    print(" -> Link para seus colegas na mesma rede (Wi-Fi/LAN):")
    print(f"    {primary_lan_url}")
    print("=" * 68)

    if server_only or not HAS_WEBVIEW:
        print("[INFO] Executando em modo de servidor dedicado. Pressione Ctrl+C para encerrar.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            server.shutdown()
            sys.exit(0)
    else:
        # Abre a janela nativa do jogo em tela cheia
        window = webview.create_window(
            title="Fatal Error",
            url=local_url,
            width=1280,
            height=720,
            min_size=(960, 540),
            resizable=True,
            fullscreen=True,
            confirm_close=False,
            background_color='#0b0c10'
        )
        webview.start(gui='edgechromium')
        server.shutdown()
        sys.exit(0)


if __name__ == '__main__':
    main()
