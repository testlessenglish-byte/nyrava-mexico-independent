const url = "https://plyqpmrucbsyxybmkoeg.supabase.co/pg/v1/query";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBseXFwbXJ1Y2JzeXh5Ym1rb2VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYxNzcwMSwiZXhwIjoyMTA0MTkzNzAxfQ.QnnmVdBzOeivSDnkFfqL3vCYf37uR6TY99c1m7auKx4";

async function run() {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "SELECT 1" })
  });
  console.log(res.status, await res.text());
}
run();
