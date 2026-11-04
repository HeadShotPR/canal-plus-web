const fetch = globalThis.fetch;

async function testLoginProxy() {
  const target = "http://5tv.store/player_api.php?username=test&password=test";
  const proxyUrl = "https://canal-plus-web.vercel.app/api/proxy?url=" + encodeURIComponent(target);
  console.log("Testing:", proxyUrl);

  try {
    const start = Date.now();
    const res = await fetch(proxyUrl);
    const duration = Date.now() - start;
    console.log("Status:", res.status, "Duration:", duration + "ms");
    const text = await res.text();
    console.log("Body length:", text.length, "Preview:", text.substring(0, 150));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testLoginProxy();
