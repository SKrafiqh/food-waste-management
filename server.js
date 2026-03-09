const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
let osUtils;
try { osUtils = require('os-utils'); } catch (e) { }

// Load config
dotenv.config({ path: '../.env' });

const app = express();
app.use(cors());
app.use(express.json());

// Global error handlers to prevent crash
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

// Initialize TWO Supabase clients:
// - supabaseAuth: used ONLY for signInWithPassword / signUp (contaminates session)
// - supabase: used for ALL database operations (preserves service role key)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials!");
    process.exit(1);
}

const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// ==========================================
// AUTHENTICATION ROUTES (SaaS)
// ==========================================

// Register (Restaurants / NGOs)
app.post('/auth/register', async (req, res) => {
    try {
        const { email, password, role, name, location_code, address, contact_phone } = req.body;

        // 1. Create user in Supabase Auth
        const { data: authData, error: authError } = await supabaseAuth.auth.admin.createUser({
            email,
            password,
            email_confirm: true // auto confirm for demo
        });

        if (authError) throw authError;

        const userId = authData.user.id;

        // 2. Insert into appropriate role table
        let dbError = null;
        if (role === 'RESTAURANT') {
            const { error } = await supabase.from('restaurants').insert([{
                user_id: userId, name, location_code, address, contact_phone
            }]);
            dbError = error;
        } else if (role === 'NGO') {
            const { error } = await supabase.from('ngos').insert([{
                user_id: userId, name, location_code, address, contact_phone
            }]);
            dbError = error;
        } else if (role === 'ADMIN') {
            // Admins don't need a profile in ngos or restaurants tables
            dbError = null;
        } else {
            throw new Error("Invalid role specified");
        }

        if (dbError) {
            // Rollback auth
            await supabaseAuth.auth.admin.deleteUser(userId);
            throw dbError;
        }

        res.status(201).json({ success: true, message: 'Registration successful', userId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        const { data, error } = await supabaseAuth.auth.signInWithPassword({
            email, password
        });

        if (error) {
            return res.status(401).json({ success: false, error: error.message || 'Invalid credentials' });
        }

        // Lookup role - use array select to avoid crash on no match
        const { data: restArr } = await supabase.from('restaurants').select('id, name, location_code').eq('user_id', data.user.id);
        const { data: ngoArr } = await supabase.from('ngos').select('id, name, location_code').eq('user_id', data.user.id);

        let role = 'ADMIN';
        let profile = null;
        if (restArr && restArr.length > 0) { role = 'RESTAURANT'; profile = restArr[0]; }
        else if (ngoArr && ngoArr.length > 0) { role = 'NGO'; profile = ngoArr[0]; }

        res.status(200).json({
            success: true,
            message: 'Login successful',
            session: data.session,
            user: data.user,
            role,
            profile
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

// ==========================================
// EXISTING ROUTES
// ==========================================

// 1. POST /donate/normal (Normal Donor)
app.post('/donate/normal', async (req, res) => {
    try {
        const { donor_name, food_type, quantity_kg, expiry_hours, location_code, image_url } = req.body;

        const { data, error } = await supabase
            .from('donations')
            .insert([{
                donor_name, food_type, quantity_kg, expiry_hours, location_code, image_url,
                restaurant_id: null, status: 'AVAILABLE'
            }])
            .select();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Donation submitted', data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. POST /donate/restaurant (Restaurant Donor)
app.post('/donate/restaurant', async (req, res) => {
    try {
        const { restaurant_id, food_type, quantity_kg, expiry_hours, location_code, image_url } = req.body;

        const { data, error } = await supabase
            .from('donations')
            .insert([{
                restaurant_id, food_type, quantity_kg, expiry_hours, location_code, image_url,
                donor_name: null, status: 'AVAILABLE'
            }])
            .select();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Restaurant donation logged', data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. POST /ngo/request (NGO places a food request)
app.post('/ngo/request', async (req, res) => {
    try {
        const { ngo_id, food_category, urgency, needed_kg } = req.body;

        const { data, error } = await supabase
            .from('requests')
            .insert([{
                ngo_id, food_category, urgency, needed_kg, status: 'PENDING'
            }])
            .select();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Request submitted', data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. GET /ngos/nearby (Suggest NGOs for Normal Donors)
app.get('/ngos/nearby', async (req, res) => {
    try {
        const { location_code } = req.query;
        let query = supabase.from('ngos').select('*');

        if (location_code) {
            query = query.eq('location_code', location_code);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4D. GET /donations/incoming (Incoming available donations for NGO by location)
app.get('/donations/incoming', async (req, res) => {
    try {
        const { location_code } = req.query;
        if (!location_code) return res.status(400).json({ success: false, error: 'location_code required' });

        const { data, error } = await supabase
            .from('donations')
            .select('*')
            .eq('location_code', location_code)
            .eq('status', 'AVAILABLE')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4E. POST /donations/:id/accept (NGO accepts/claims a donation)
app.post('/donations/:id/accept', async (req, res) => {
    try {
        const { id } = req.params;
        const { ngo_id, ngo_name } = req.body;

        // Update donation status to ASSIGNED
        const { data, error } = await supabase
            .from('donations')
            .update({ status: 'ASSIGNED' })
            .eq('id', id)
            .eq('status', 'AVAILABLE')
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(409).json({ success: false, error: 'Donation already claimed or not found' });
        }

        res.status(200).json({ success: true, message: `Donation accepted by ${ngo_name || 'NGO'}`, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4C. GET /requests/active (Public - show active NGO food needs on landing page)
app.get('/requests/active', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('requests')
            .select('id, food_category, urgency, needed_kg, status, created_at, ngo_id')
            .in('status', ['PENDING', 'MATCHED'])
            .order('urgency', { ascending: false })
            .limit(12);

        if (error) throw error;

        // Fetch NGO names for each request
        const ngoIds = [...new Set(data.map(r => r.ngo_id).filter(Boolean))];
        let ngoMap = {};
        if (ngoIds.length > 0) {
            const { data: ngos } = await supabase.from('ngos').select('id, name, location_code').in('id', ngoIds);
            if (ngos) {
                ngos.forEach(n => { ngoMap[n.id] = n; });
            }
        }

        const enriched = data.map(r => ({
            ...r,
            ngo_name: ngoMap[r.ngo_id]?.name || 'Anonymous NGO',
            ngo_location: ngoMap[r.ngo_id]?.location_code || 'Unknown'
        }));

        res.status(200).json({ success: true, data: enriched });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4F. GET /requests/for-restaurant (NGO requests forwarded to restaurants by location)
app.get('/requests/for-restaurant', async (req, res) => {
    try {
        const { location_code } = req.query;
        if (!location_code) return res.status(400).json({ success: false, error: 'location_code required' });

        // Get NGOs in the same location
        const { data: ngos } = await supabase.from('ngos').select('id, name, location_code, contact_phone')
            .eq('location_code', location_code);

        if (!ngos || ngos.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const ngoIds = ngos.map(n => n.id);
        const ngoMap = {};
        ngos.forEach(n => { ngoMap[n.id] = n; });

        // Get pending requests from those NGOs
        const { data: requests, error } = await supabase.from('requests')
            .select('*')
            .in('ngo_id', ngoIds)
            .eq('status', 'PENDING')
            .order('urgency', { ascending: false });

        if (error) throw error;

        const enriched = (requests || []).map(r => ({
            ...r,
            ngo_name: ngoMap[r.ngo_id]?.name || 'Unknown NGO',
            ngo_location: ngoMap[r.ngo_id]?.location_code || '',
            ngo_phone: ngoMap[r.ngo_id]?.contact_phone || ''
        }));

        res.status(200).json({ success: true, data: enriched });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4G. POST /requests/:id/fulfill (Restaurant accepts/fulfills an NGO request)
app.post('/requests/:id/fulfill', async (req, res) => {
    try {
        const { id } = req.params;
        const { restaurant_id, restaurant_name, food_type, quantity_kg, expiry_hours, location_code } = req.body;

        // Update request status to MATCHED
        const { data: reqData, error: reqErr } = await supabase
            .from('requests')
            .update({ status: 'MATCHED' })
            .eq('id', id)
            .eq('status', 'PENDING')
            .select();

        if (reqErr) throw reqErr;
        if (!reqData || reqData.length === 0) {
            return res.status(409).json({ success: false, error: 'Request already fulfilled or not found' });
        }

        // Create a donation entry linked to this restaurant
        if (restaurant_id && food_type) {
            await supabase.from('donations').insert([{
                restaurant_id,
                food_type: food_type || 'Food Donation',
                quantity_kg: quantity_kg || reqData[0].needed_kg,
                expiry_hours: expiry_hours || 6,
                location_code: location_code || '',
                status: 'ASSIGNED'
            }]);
        }

        res.status(200).json({ success: true, message: `Request fulfilled by ${restaurant_name || 'Restaurant'}`, data: reqData });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4H. POST /requests/:id/decline (Restaurant declines an NGO request — just marks it as seen)
app.post('/requests/:id/decline', async (req, res) => {
    // Declining doesn't change status — the request stays PENDING for others
    res.status(200).json({ success: true, message: 'Request declined. It remains available for other restaurants.' });
});

// 4A. GET /restaurant/donations (Fetch donations for a specific restaurant)
app.get('/restaurant/donations', async (req, res) => {
    try {
        const { restaurant_id } = req.query;
        if (!restaurant_id) return res.status(400).json({ success: false, error: 'restaurant_id required' });

        const { data, error } = await supabase
            .from('donations')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4B. GET /ngo/requests (Fetch requests for a specific NGO)
app.get('/ngo/requests', async (req, res) => {
    try {
        const { ngo_id } = req.query;
        if (!ngo_id) return res.status(400).json({ success: false, error: 'ngo_id required' });

        const { data, error } = await supabase
            .from('requests')
            .select('*')
            .eq('ngo_id', ngo_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. POST /admin/run-matching (Trigger C Engine via Python Bridge)
app.post('/admin/run-matching', (req, res) => {
    console.log("Admin triggered matching batch job.");
    const pythonBridgeDir = path.resolve(__dirname, '../python_bridge');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    exec(`${pythonCmd} run_matching.py`, { cwd: pythonBridgeDir }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ success: false, error: "Matching bridge failed", details: stderr || error.message });
        }

        console.log(`Matching Output:\n${stdout}`);

        let reportText = "";
        try {
            reportText = fs.readFileSync(path.resolve(__dirname, '../data/admin_report.txt'), 'utf-8');
        } catch (readErr) {
            console.log("No report found or read error.");
        }

        res.status(200).json({ success: true, message: 'Batch matching completed', report: reportText, stdout });
    });
});

// 6. GET /admin/analytics (Get system snapshot)
app.get('/admin/analytics', async (req, res) => {
    try {
        const p1 = supabase.from('donations').select('*', { count: 'exact', head: true });
        const p2 = supabase.from('requests').select('*', { count: 'exact', head: true });
        const p3 = supabase.from('matches').select('*', { count: 'exact', head: true });

        const [donations, requests, matches] = await Promise.all([p1, p2, p3]);

        res.status(200).json({
            success: true,
            data: {
                total_donations: donations.count,
                total_requests: requests.count,
                total_matches: matches.count
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. GET /admin/health (System Health Monitoring)
app.get('/admin/health', (req, res) => {
    try {
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        const usedMem = totalMem - freeMem;
        const memoryUsage = ((usedMem / totalMem) * 100).toFixed(2);
        const uptime = os.uptime();
        const platform = os.platform();

        if (osUtils) {
            osUtils.cpuUsage(function (cpuValue) {
                const cpuUsage = (cpuValue * 100).toFixed(2);
                res.status(200).json({
                    success: true,
                    data: {
                        cpu_usage_pct: cpuUsage,
                        memory_usage_pct: memoryUsage,
                        uptime_sec: uptime,
                        system: platform,
                        status: parseFloat(cpuUsage) > 85 ? 'WARNING' : 'HEALTHY'
                    }
                });
            });
        } else {
            res.status(200).json({
                success: true,
                data: {
                    cpu_usage_pct: "N/A",
                    memory_usage_pct: memoryUsage,
                    uptime_sec: uptime,
                    system: platform,
                    status: 'HEALTHY'
                }
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. Admin User Management (GET and DELETE for NGOs and Restaurants)
app.get('/admin/ngos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('ngos').select('*');
        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/admin/ngos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('ngos').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ success: true, message: 'NGO deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/admin/restaurants', async (req, res) => {
    try {
        const { data, error } = await supabase.from('restaurants').select('*');
        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/admin/restaurants/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('restaurants').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ success: true, message: 'Restaurant deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Express error middleware - catch all errors and return JSON
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`FoodShare Core API running on port ${PORT}`);
});
