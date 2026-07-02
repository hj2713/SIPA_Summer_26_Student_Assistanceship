#!/usr/bin/env python3
"""
Ping script to keep the Supabase database alive.
Connects via DATABASE_URL and executes a simple query.
"""
import os
import sys

# Try loading from .env for local testing
try:
    from dotenv import load_dotenv
    # Look for .env in the parent folders or backend folder
    backend_env = os.path.join(os.path.dirname(__file__), "../../backend/.env")
    if os.path.exists(backend_env):
        load_dotenv(backend_env)
    else:
        load_dotenv()
except ImportError:
    pass

def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL environment variable is not set.")
        sys.exit(1)
        
    print("Connecting to Supabase Database...")
    try:
        import psycopg
        # Use a short connection timeout so we don't hang indefinitely
        conn = psycopg.connect(database_url, connect_timeout=10)
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1;")
                result = cursor.fetchone()
                print(f"Success! Executed 'SELECT 1;', got: {result}")
        finally:
            conn.close()
    except Exception as e:
        print(f"Failed to query database: {e}", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
