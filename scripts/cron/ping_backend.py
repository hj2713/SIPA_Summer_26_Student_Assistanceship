#!/usr/bin/env python3
"""
Ping script to keep the backend API alive.
Pings the /health endpoint every run.
"""
import os
import urllib.request
import urllib.error
import sys

def main():
    # Read backend URL from environment
    backend_url = os.environ.get("BACKEND_URL")
    if not backend_url:
        print("Error: BACKEND_URL environment variable is not set.")
        sys.exit(1)
        
    # Clean backend_url
    backend_url = backend_url.rstrip("/")
    health_url = f"{backend_url}/health"
    
    print(f"Pinging backend at: {health_url}")
    try:
        req = urllib.request.Request(
            health_url, 
            headers={"User-Agent": "Law-Delegation-KeepAlive/1.0"}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            status = response.getcode()
            body = response.read().decode("utf-8")
            print(f"Success! Status code: {status}, Response: {body}")
    except urllib.error.URLError as e:
        print(f"Failed to connect to backend: {e}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(3)

if __name__ == "__main__":
    main()
