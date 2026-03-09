// seed.js - Run this to populate the DB with dummy data
const API_URL = 'http://localhost:3000';

const dummyData = [
    // NGOs
    { email: 'nyc.shelter@example.com', password: 'password123', role: 'NGO', name: 'NYC Downtown Shelter', location_code: 'NYC-100', address: '100 Broadway, NY', contact_phone: '555-0100' },
    { email: 'brooklyn.relief@example.com', password: 'password123', role: 'NGO', name: 'Brooklyn Daily Relief', location_code: 'NYC-100', address: '250 Brooklyn Ave', contact_phone: '555-0101' },
    { email: 'boston.foodbank@example.com', password: 'password123', role: 'NGO', name: 'Boston Central Foodbank', location_code: 'BOS-021', address: '10 State St, MA', contact_phone: '555-0200' },
    { email: 'sf.harvest@example.com', password: 'password123', role: 'NGO', name: 'SF Golden Harvest', location_code: 'SFO-941', address: '500 Market St, SF', contact_phone: '555-0300' },
    { email: 'chicago.hope@example.com', password: 'password123', role: 'NGO', name: 'Chicago Hope Kitchen', location_code: 'CHI-606', address: '200 Loop Dr, IL', contact_phone: '555-0400' },

    // Restaurants
    { email: 'central.bistro@example.com', password: 'password123', role: 'RESTAURANT', name: 'Central Park Bistro', location_code: 'NYC-100', address: '150 Central Park W', contact_phone: '555-1100' },
    { email: 'bay.seafood@example.com', password: 'password123', role: 'RESTAURANT', name: 'Bay Area Seafood', location_code: 'SFO-941', address: 'Pier 39, SF', contact_phone: '555-1300' },
    { email: 'boston.bakery@example.com', password: 'password123', role: 'RESTAURANT', name: 'New England Bakery', location_code: 'BOS-021', address: '40 Newbury St, MA', contact_phone: '555-1200' },
];

async function seed() {
    console.log("Starting Dummy Data Seeding...");
    for (const data of dummyData) {
        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.success) {
                console.log(`Successfully registered: ${data.name} (${data.role})`);
            } else {
                console.log(`Failed to register ${data.name}: ${result.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.log(`Fetch error for ${data.name}: ${err.message}`);
        }
    }
    console.log("Seeding complete.");
}

seed();
