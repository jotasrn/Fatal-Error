#!/usr/bin/env python3
"""Dev server wrapper delegating to launcher.py with all security features."""
import sys
from launcher import run_server

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8910
    run_server(port=port, auto_open=True)
