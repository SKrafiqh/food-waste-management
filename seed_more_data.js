const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedMore() {
    console.log("Seeding MORE Indian Data...");

    // More NGOs
    const ngos = [
        { email: 'ngo.chennai@smile.in', pass: 'Ngo@123', name: 'Smile Foundation (Chennai)', code: 'MAA-600001', address: 'T Nagar, Chennai, TN', phone: '+91 9111111111' },
        { email: 'ngo.hyd@goonj.org', pass: 'Ngo@123', name: 'Goonj (Hyderabad Base)', code: 'HYD-500001', address: 'Banjara Hills, Hyderabad', phone: '+91 9222222222' },
        { email: 'ngo.kol@katha.org', pass: 'Ngo@123', name: 'Katha Outreach (Kolkata)', code: 'CCU-700001', address: 'Park Street, Kolkata', phone: '+91 9333333333' }
    ];

    for (const ngo of ngos) {
        let uId;
        const { data: search } = await supabase.auth.admin.listUsers();
        let uFound = search?.users.find(u => u.email === ngo.email);

        if (!uFound) {
            console.log(`Creating NGO: ${ngo.name}`);
            const { data: newNgo } = await supabase.auth.admin.createUser({
                email: ngo.email, password: ngo.pass, email_confirm: true
            });
            uId = newNgo?.user?.id;
        } else {
            uId = uFound.id;
        }

        if (uId) {
            await supabase.from('ngos').upsert([
                { user_id: uId, name: ngo.name, location_code: ngo.code, address: ngo.address, contact_phone: ngo.phone }
            ]);
        }
    }

    // More Restaurants
    const rests = [
        { email: 'rest.chennai@itc.in', pass: 'Rest@123', name: 'ITC Grand Chola Kitchen', code: 'MAA-600001', address: 'Guindy, Chennai', phone: '+91 9444444444' },
        { email: 'rest.hyd@paradise.in', pass: 'Rest@123', name: 'Paradise Biryani Central', code: 'HYD-500001', address: 'Secunderabad, Hyderabad', phone: '+91 9555555555' },
        { email: 'rest.kol@flurys.org', pass: 'Rest@123', name: 'Flurys Bakery & Cafe', code: 'CCU-700001', address: 'Park Street, Kolkata', phone: '+91 9666666666' }
    ];

    for (const rest of rests) {
        let uId;
        const { data: search } = await supabase.auth.admin.listUsers();
        let uFound = search?.users.find(u => u.email === rest.email);

        if (!uFound) {
            console.log(`Creating Restaurant: ${rest.name}`);
            const { data: newRest } = await supabase.auth.admin.createUser({
                email: rest.email, password: rest.pass, email_confirm: true
            });
            uId = newRest?.user?.id;
        } else {
            uId = uFound.id;
        }

        if (uId) {
            await supabase.from('restaurants').upsert([
                { user_id: uId, name: rest.name, location_code: rest.code, address: rest.address, contact_phone: rest.phone }
            ]);
        }
    }

    // Requests and Donations
    const { data: dbNgos } = await supabase.from('ngos').select('id, name');
    const { data: dbRests } = await supabase.from('restaurants').select('id, name');

    if (dbNgos && dbRests) {
        const hydNgoId = dbNgos.find(n => n.name.includes('Goonj'))?.id;
        const hydRestId = dbRests.find(r => r.name.includes('Paradise Biryani'))?.id;

        if (hydNgoId) {
            await supabase.from('requests').insert([
                { ngo_id: hydNgoId, food_category: 'Hot Meals (Biryani)', urgency: 3, needed_kg: 200, status: 'PENDING' },
                { ngo_id: hydNgoId, food_category: 'Snacks & Lentils', urgency: 2, needed_kg: 50, status: 'PENDING' }
            ]);
        }
        if (hydRestId) {
            await supabase.from('donations').insert([
                { restaurant_id: hydRestId, food_type: 'Chicken & Veg Biryani Tubs', quantity_kg: 100, expiry_hours: 4, location_code: 'HYD-500001', status: 'AVAILABLE' }
            ]);
        }

        const chenNgoId = dbNgos.find(n => n.name.includes('Smile Foundation'))?.id;
        const chenRestId = dbRests.find(r => r.name.includes('ITC'))?.id;

        if (chenNgoId) {
            await supabase.from('requests').insert([
                { ngo_id: chenNgoId, food_category: 'Rice & Sambar', urgency: 2, needed_kg: 100, status: 'PENDING' }
            ]);
        }
        if (chenRestId) {
            await supabase.from('donations').insert([
                { restaurant_id: chenRestId, food_type: 'Premium South Indian Thali Excess', quantity_kg: 60, expiry_hours: 5, location_code: 'MAA-600001', status: 'AVAILABLE' }
            ]);
        }

        const kolNgoId = dbNgos.find(n => n.name.includes('Katha'))?.id;
        const kolRestId = dbRests.find(r => r.name.includes('Flurys'))?.id;

        if (kolNgoId) {
            await supabase.from('requests').insert([
                { ngo_id: kolNgoId, food_category: 'Baked Goods & Breads', urgency: 1, needed_kg: 75, status: 'PENDING' }
            ]);
        }
        if (kolRestId) {
            await supabase.from('donations').insert([
                { restaurant_id: kolRestId, food_type: 'Assorted Puff Pastries & Breads', quantity_kg: 35, expiry_hours: 24, location_code: 'CCU-700001', status: 'AVAILABLE' },
                { restaurant_id: kolRestId, food_type: 'Cakes and Muffins', quantity_kg: 15, expiry_hours: 48, location_code: 'CCU-700001', status: 'AVAILABLE' }
            ]);
        }
    }

    console.log("SUCCESS! Added 3 more cities of actors and volume parameters.");
    process.exit(0);
}

seedMore().catch(console.error);
