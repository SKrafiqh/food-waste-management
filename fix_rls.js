// Fix RLS policies by using Supabase's REST/SQL API
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function addRLSPolicies() {
    console.log('=== Fixing RLS Policies via Supabase SQL API ===\n');

    const sql = `
        -- Requests table (missing INSERT/UPDATE/DELETE)
        CREATE POLICY "Allow Insert Requests" ON public.requests FOR INSERT WITH CHECK (true);
        CREATE POLICY "Allow Update Requests" ON public.requests FOR UPDATE USING (true);
        CREATE POLICY "Allow Delete Requests" ON public.requests FOR DELETE USING (true);
        
        -- Restaurants table (missing INSERT/UPDATE/DELETE)
        CREATE POLICY "Allow Insert Restaurants" ON public.restaurants FOR INSERT WITH CHECK (true);
        CREATE POLICY "Allow Update Restaurants" ON public.restaurants FOR UPDATE USING (true);
        CREATE POLICY "Allow Delete Restaurants" ON public.restaurants FOR DELETE USING (true);
        
        -- NGOs table (missing INSERT/UPDATE/DELETE)
        CREATE POLICY "Allow Insert NGOs" ON public.ngos FOR INSERT WITH CHECK (true);
        CREATE POLICY "Allow Update NGOs" ON public.ngos FOR UPDATE USING (true);
        CREATE POLICY "Allow Delete NGOs" ON public.ngos FOR DELETE USING (true);
        
        -- Donations table (INSERT exists, add UPDATE/DELETE)
        CREATE POLICY "Allow Update Donations" ON public.donations FOR UPDATE USING (true);
        CREATE POLICY "Allow Delete Donations" ON public.donations FOR DELETE USING (true);
        
        -- Matches table (missing INSERT/UPDATE)
        CREATE POLICY "Allow Insert Matches" ON public.matches FOR INSERT WITH CHECK (true);
        CREATE POLICY "Allow Update Matches" ON public.matches FOR UPDATE USING (true);
    `;

    // Try the Supabase SQL endpoint (available on hosted Supabase)
    try {
        const resp = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql_text: sql })
        });

        if (resp.ok) {
            console.log('✅ Policies added via RPC!');
            return;
        }
        console.log('RPC method not available (status:', resp.status, ')');
    } catch (e) {
        console.log('RPC attempt failed:', e.message);
    }

    // If RPC isn't available, try individual policy creation via SQL statements
    const statements = sql.trim().split(';').filter(s => s.trim().length > 0);

    for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;

        try {
            const resp = await fetch(`${url}/rest/v1/rpc/`, {
                method: 'POST',
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({})
            });
        } catch (e) { /* ignore */ }
    }

    console.log('\n⚠️  Could not add policies programmatically.');
    console.log('Please run the following SQL in the Supabase Dashboard SQL Editor:\n');
    console.log('Go to: https://supabase.com/dashboard/project → SQL Editor → New Query');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    console.log('\nAlternatively, you can disable RLS entirely for this demo app.');
}

addRLSPolicies();
