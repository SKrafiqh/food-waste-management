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

async function seedSampleData() {
    console.log("=== Seeding Public Donations & NGO Requests ===\n");

    // -------------------------------------------------------
    // 1. PUBLIC (ANONYMOUS) DONATIONS — shown in Quick Donate
    // -------------------------------------------------------
    const publicDonations = [
        { donor_name: 'Ramesh Sharma', food_type: 'Dal Chawal & Roti (Home-cooked)', quantity_kg: 8, expiry_hours: 3, location_code: 'DEL-110001', status: 'AVAILABLE' },
        { donor_name: 'Priya Mehta', food_type: 'Vegetable Pulao & Raita', quantity_kg: 12, expiry_hours: 5, location_code: 'BOM-400001', status: 'AVAILABLE' },
        { donor_name: 'Anonymous', food_type: 'Wedding Feast Leftovers — Paneer, Biryani, Gulab Jamun', quantity_kg: 45, expiry_hours: 6, location_code: 'DEL-110001', status: 'AVAILABLE' },
        { donor_name: 'Sita Devi', food_type: 'Idli, Sambar & Coconut Chutney', quantity_kg: 5, expiry_hours: 4, location_code: 'MAA-600001', status: 'AVAILABLE' },
        { donor_name: 'Ankit Jain', food_type: 'Pav Bhaji (20 plates)', quantity_kg: 10, expiry_hours: 3, location_code: 'BOM-400001', status: 'AVAILABLE' },
        { donor_name: 'Kavita Reddy', food_type: 'Hyderabadi Dum Biryani (Veg & Non-veg)', quantity_kg: 30, expiry_hours: 4, location_code: 'HYD-500001', status: 'AVAILABLE' },
        { donor_name: 'Anonymous', food_type: 'Fresh Fruit Baskets — Mangoes, Bananas, Guava', quantity_kg: 15, expiry_hours: 48, location_code: 'CCU-700001', status: 'AVAILABLE' },
        { donor_name: 'Suresh Kumar', food_type: 'Chole Bhature & Lassi', quantity_kg: 7, expiry_hours: 3, location_code: 'DEL-110001', status: 'AVAILABLE' },
        { donor_name: 'Meena Iyer', food_type: 'Dosa Batter & Sambar (bulk)', quantity_kg: 20, expiry_hours: 12, location_code: 'MAA-600001', status: 'AVAILABLE' },
        { donor_name: 'Community Kitchen Noida', food_type: 'Mixed Veg Rice & Dal Tadka', quantity_kg: 50, expiry_hours: 5, location_code: 'DEL-110001', status: 'AVAILABLE' },
    ];

    console.log(`Inserting ${publicDonations.length} public donations...`);
    const { error: donErr } = await supabase.from('donations').insert(
        publicDonations.map(d => ({ ...d, restaurant_id: null, image_url: '' }))
    );
    if (donErr) {
        console.error("Donation insert error:", donErr.message);
    } else {
        console.log("✅ Public donations inserted successfully!\n");
    }

    // -------------------------------------------------------
    // 2. NGO FOOD REQUESTS — shown in Live Requests 
    // -------------------------------------------------------
    // Get existing NGOs from DB
    const { data: ngos } = await supabase.from('ngos').select('id, name');
    if (!ngos || ngos.length === 0) {
        console.log("No NGOs found in database. Skipping requests.");
        process.exit(0);
    }

    console.log(`Found ${ngos.length} NGOs. Creating requests for each...\n`);

    const requestTemplates = [
        { food_category: 'Hot Meals', urgency: 3, needed_kg: 150, status: 'PENDING' },
        { food_category: 'Baked Goods', urgency: 2, needed_kg: 40, status: 'PENDING' },
        { food_category: 'Any', urgency: 3, needed_kg: 200, status: 'PENDING' },
        { food_category: 'Produce', urgency: 1, needed_kg: 60, status: 'PENDING' },
        { food_category: 'Hot Meals', urgency: 2, needed_kg: 100, status: 'PENDING' },
        { food_category: 'Any', urgency: 1, needed_kg: 80, status: 'PENDING' },
        { food_category: 'Baked Goods', urgency: 3, needed_kg: 50, status: 'PENDING' },
        { food_category: 'Produce', urgency: 2, needed_kg: 70, status: 'PENDING' },
    ];

    // Distribute requests across NGOs
    const requests = [];
    for (let i = 0; i < requestTemplates.length; i++) {
        const ngo = ngos[i % ngos.length];
        requests.push({
            ngo_id: ngo.id,
            ...requestTemplates[i]
        });
        console.log(`  → ${ngo.name}: ${requestTemplates[i].food_category} (${requestTemplates[i].needed_kg}kg, urgency ${requestTemplates[i].urgency})`);
    }

    const { error: reqErr } = await supabase.from('requests').insert(requests);
    if (reqErr) {
        console.error("Request insert error:", reqErr.message);
    } else {
        console.log(`\n✅ ${requests.length} NGO food requests inserted successfully!`);
    }

    console.log("\n=== Seeding Complete! ===");
    console.log("• Public donations visible at: donate.html");
    console.log("• Live requests visible at: index.html (landing page)");
    process.exit(0);
}

seedSampleData().catch(err => {
    console.error("Seed failed:", err);
    process.exit(1);
});
