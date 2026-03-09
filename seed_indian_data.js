const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config({ path: '../.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedData() {
    console.log("Starting Seed Process for Indian Data...");

    // 1. Admin Account
    const adminEmail = 'admin@foodshare.in';
    const adminPass = 'Admin@123';

    // Check if admin exists
    const { data: existingAdmin, error: adminErr } = await supabase.auth.admin.listUsers();
    let adminId = null;

    const adminFound = existingAdmin?.users.find(u => u.email === adminEmail);
    if (!adminFound) {
        console.log("Creating Admin User...");
        const { data: newAdmin, error: createAdminErr } = await supabase.auth.admin.createUser({
            email: adminEmail,
            password: adminPass,
            email_confirm: true
        });
        if (createAdminErr) console.error("Admin create err", createAdminErr);
        adminId = newAdmin?.user?.id;
    } else {
        adminId = adminFound.id;
        console.log("Admin exists. id:", adminId);
        // Ensure password is correct
        await supabase.auth.admin.updateUserById(adminId, { password: adminPass });
    }

    // 2. NGO Accounts (Receivers)
    const ngos = [
        { email: 'ngo.delhi@helpage.in', pass: 'Ngo@123', name: 'HelpAge India (Delhi HQ)', code: 'DEL-110001', address: 'Connaught Place, New Delhi', phone: '+91 9876543210' },
        { email: 'ngo.mumbai@robinhood.in', pass: 'Ngo@123', name: 'Robin Hood Army (Mumbai)', code: 'BOM-400001', address: 'Colaba, Mumbai, Maharashtra', phone: '+91 9876543211' },
        { email: 'ngo.blr@akshayapatra.org', pass: 'Ngo@123', name: 'Akshaya Patra Foundation', code: 'BLR-560001', address: 'Rajajinagar, Bengaluru, Karnataka', phone: '+91 9876543212' }
    ];

    for (const ngo of ngos) {
        const uFound = existingAdmin?.users.find(u => u.email === ngo.email);
        let uId = uFound ? uFound.id : null;

        if (!uFound) {
            console.log(`Creating NGO: ${ngo.name}`);
            const { data: newNgo } = await supabase.auth.admin.createUser({
                email: ngo.email, password: ngo.pass, email_confirm: true
            });
            uId = newNgo?.user?.id;

            // Insert profile
            if (uId) {
                await supabase.from('ngos').upsert([
                    { user_id: uId, name: ngo.name, location_code: ngo.code, address: ngo.address, contact_phone: ngo.phone }
                ]);
            }
        } else {
            await supabase.auth.admin.updateUserById(uId, { password: ngo.pass });
            await supabase.from('ngos').upsert([
                { user_id: uId, name: ngo.name, location_code: ngo.code, address: ngo.address, contact_phone: ngo.phone }
            ]);
        }
    }

    // 3. Restaurant Accounts (Donors)
    const restaurants = [
        { email: 'rest.delhi@tajhotels.com', pass: 'Rest@123', name: 'Taj Palace Kitchens', code: 'DEL-110001', address: 'Sardar Patel Marg, New Delhi', phone: '+91 9811111111' },
        { email: 'rest.mumbai@bombaycanteen.in', pass: 'Rest@123', name: 'The Bombay Canteen', code: 'BOM-400001', address: 'Lower Parel, Mumbai', phone: '+91 9822222222' },
        { email: 'rest.blr@nagarjuna.in', pass: 'Rest@123', name: 'Nagarjuna Residency', code: 'BLR-560001', address: 'Residency Road, Bengaluru', phone: '+91 9833333333' }
    ];

    for (const rest of restaurants) {
        const uFound = existingAdmin?.users.find(u => u.email === rest.email);
        let uId = uFound ? uFound.id : null;

        if (!uFound) {
            console.log(`Creating Restaurant: ${rest.name}`);
            const { data: newRest } = await supabase.auth.admin.createUser({
                email: rest.email, password: rest.pass, email_confirm: true
            });
            uId = newRest?.user?.id;

            // Insert profile
            if (uId) {
                await supabase.from('restaurants').upsert([
                    { user_id: uId, name: rest.name, location_code: rest.code, address: rest.address, contact_phone: rest.phone }
                ]);
            }
        } else {
            await supabase.auth.admin.updateUserById(uId, { password: rest.pass });
            await supabase.from('restaurants').upsert([
                { user_id: uId, name: rest.name, location_code: rest.code, address: rest.address, contact_phone: rest.phone }
            ]);
        }
    }

    // 4. Sample Donations & Requests
    console.log("Seeding Requests and Donations...");

    // Get fetched IDs for the ones we just added to the DB to map them correctly
    const { data: dbNgos } = await supabase.from('ngos').select('id, name');
    const { data: dbRests } = await supabase.from('restaurants').select('id, name');

    if (dbNgos && dbNgos.length > 0 && dbRests && dbRests.length > 0) {
        // Delhi Need 
        const delhiNgoId = dbNgos.find(n => n.name.includes('HelpAge'))?.id;
        const delhiRestId = dbRests.find(r => r.name.includes('Taj'))?.id;

        if (delhiNgoId) {
            await supabase.from('requests').insert([{
                ngo_id: delhiNgoId, food_category: 'Prepared Hot Meals', urgency: 3, needed_kg: 150, status: 'PENDING'
            }]);
        }

        if (delhiRestId) {
            await supabase.from('donations').insert([{
                restaurant_id: delhiRestId, food_type: 'Assorted Curry & Rice Tubs', quantity_kg: 45.5, expiry_hours: 6, location_code: 'DEL-110001', status: 'AVAILABLE'
            }]);
        }

        // Mumbai Need
        const mumbaiNgoId = dbNgos.find(n => n.name.includes('Robin Hood'))?.id;
        const mumbaiRestId = dbRests.find(r => r.name.includes('Bombay Canteen'))?.id;

        if (mumbaiNgoId) {
            await supabase.from('requests').insert([{
                ngo_id: mumbaiNgoId, food_category: 'Baked Goods', urgency: 1, needed_kg: 50, status: 'PENDING'
            }]);
        }

        if (mumbaiRestId) {
            await supabase.from('donations').insert([{
                restaurant_id: mumbaiRestId, food_type: 'Assorted Pav and Breads', quantity_kg: 20, expiry_hours: 12, location_code: 'BOM-400001', status: 'AVAILABLE'
            }]);
        }
    }

    console.log("=====================================");
    console.log("SEEDING COMPLETE!");
    console.log("--- ADMIN CREDENTIALS ---");
    console.log("Email: admin@foodshare.in");
    console.log("Password: Admin@123\n");
    console.log("--- NGO CREDENTIALS ---");
    console.log("Email: ngo.delhi@helpage.in");
    console.log("Password: Ngo@123\n");
    console.log("--- RESTAURANT CREDENTIALS ---");
    console.log("Email: rest.mumbai@bombaycanteen.in");
    console.log("Password: Rest@123\n");
    console.log("=====================================");

    process.exit(0);
}

seedData().catch(console.error);
