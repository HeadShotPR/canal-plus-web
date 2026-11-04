const fetch = globalThis.fetch;

async function testMovieUrl() {
  // Let's test what an Xtream Codes server returns for a movie request
  const testUrl = "http://5tv.store/movie/test/test/123.mp4";
  const proxyUrl = "https://canal-plus-web.vercel.app/api/proxy?url=" + encodeURIComponent(testUrl);
  console.log("Testing:", proxyUrl);

  try {
    const res = await fetch(proxyUrl);
    console.log("Status:", res.status);
    console.log("Content-Type:", res.headers.get("content-type"));
    const text = await res.text();
    console.log("Response preview:", text.substring(0, 100));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testMovieUrl();
