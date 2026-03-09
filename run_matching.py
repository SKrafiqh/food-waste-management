import os
import subprocess
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv(dotenv_path="../.env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials in .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

DATA_DIR = "../data"

def export_to_csv():
    """Fetch required data from Supabase and write to CSV."""
    print("Exporting data from Supabase to CSV...")
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # 1. Donations
    # Get available donations
    donations_resp = supabase.table('donations').select('*').eq('status', 'AVAILABLE').execute()
    df_donations = pd.DataFrame(donations_resp.data)
    if not df_donations.empty:
        # Fill missing strings, ensuring format matches C expected
        df_donations.fillna({'restaurant_id': '', 'donor_name': ''}, inplace=True)
        # Reorder to match C parser: id,restaurant_id,donor_name,food_type,quantity_kg,expiry_hours,location_code,status
        cols = ['id', 'restaurant_id', 'donor_name', 'food_type', 'quantity_kg', 'expiry_hours', 'location_code', 'status']
        df_donations = df_donations[cols]
    else:
        df_donations = pd.DataFrame(columns=['id', 'restaurant_id', 'donor_name', 'food_type', 'quantity_kg', 'expiry_hours', 'location_code', 'status'])
    df_donations.to_csv(f"{DATA_DIR}/donations.csv", index=False)

    # 2. Requests
    # Get pending requests
    requests_resp = supabase.table('requests').select('*').eq('status', 'PENDING').execute()
    df_requests = pd.DataFrame(requests_resp.data)
    if not df_requests.empty:
        # Reorder to match C parser: id,ngo_id,food_category,urgency,needed_kg,status
        cols = ['id', 'ngo_id', 'food_category', 'urgency', 'needed_kg', 'status']
        df_requests = df_requests[cols]
    else:
        df_requests = pd.DataFrame(columns=['id', 'ngo_id', 'food_category', 'urgency', 'needed_kg', 'status'])
    df_requests.to_csv(f"{DATA_DIR}/requests.csv", index=False)

    # 3. NGOs
    ngos_resp = supabase.table('ngos').select('id,name,location_code').execute()
    df_ngos = pd.DataFrame(ngos_resp.data)
    if not df_ngos.empty:
        df_ngos.to_csv(f"{DATA_DIR}/ngos.csv", index=False)
    else:
        df_ngos = pd.DataFrame(columns=['id', 'name', 'location_code'])
        df_ngos.to_csv(f"{DATA_DIR}/ngos.csv", index=False)

    print("Data exported successfully.")

def run_c_engine():
    """Execute the compiled C program."""
    print("Running C Matcher Engine...")
    
    # Executable is expected in ../c_engine/
    # Ensure cross-platform execution handling
    exe_name = "matcher.exe" if os.name == 'nt' else "./matcher"
    exe_path = os.path.join("..", "c_engine", exe_name)
    
    # We must run it from the c_engine directory so it finds ../data
    cwd_path = os.path.join("..", "c_engine")

    try:
        result = subprocess.run(
            [exe_path],
            cwd=cwd_path,
            capture_output=True,
            text=True,
            check=True
        )
        print("C Engine Output:\n", result.stdout)
    except subprocess.CalledProcessError as e:
        print("C Engine Error:\n", e.stderr)
        raise e

def push_matches_to_supabase():
    """Read matches.csv and update Supabase."""
    print("Pushing matches to Supabase...")
    matches_file = f"{DATA_DIR}/matches.csv"
    
    if not os.path.exists(matches_file):
        print("No matches.csv found. Assuming no matches made.")
        return

    df_matches = pd.read_csv(matches_file)
    if df_matches.empty:
        print("matches.csv is empty. No new matches.")
        return

    for _, row in df_matches.iterrows():
        # Insert into matches table
        match_data = {
            "donation_id": row['donation_id'],
            "request_id": row['request_id'],
            "ngo_id": row['ngo_id'],
            "match_score": row['match_score'],
            "status": row['status']
        }
        supabase.table('matches').insert(match_data).execute()

        # Update donation status
        supabase.table('donations').update({"status": "ASSIGNED"}).eq("id", row['donation_id']).execute()

        # Update request status
        supabase.table('requests').update({"status": "MATCHED"}).eq("id", row['request_id']).execute()

    print(f"Successfully processed {len(df_matches)} matches.")

if __name__ == "__main__":
    try:
        export_to_csv()
        run_c_engine()
        push_matches_to_supabase()
        print("Batch matching pipeline completed successfully.")
    except Exception as e:
        print(f"Error in batch pipeline: {e}")
