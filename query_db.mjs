const url = "https://plyqpmrucbsyxybmkoeg.supabase.co/rest/v1/social_cases?select=priority";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBseXFwbXJ1Y2JzeXh5Ym1rb2VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYxNzcwMSwiZXhwIjoyMTA0MTkzNzAxfQ.QnnmVdBzOeivSDnkFfqL3vCYf37uR6TY99c1m7auKx4";

async function run() {
  const res = await fetch(url, {
    headers: {
      "apikey": key,
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json"
    }
  });
  if (res.ok) {
    const data = await res.json();
    const priorities = [...new Set(data.map(d => d.priority))];
    console.log("Distinct priorities in DB:", priorities);
  } else {
    console.log("Error:", res.status, await res.text());
  }
}
run();
