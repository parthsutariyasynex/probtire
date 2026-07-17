const MAGENTO_GRAPHQL = "https://altalayi-live.btire.com/graphql";
const query = `{
  __schema {
    types {
      name
    }
  }
}`;

async function testConnection() {
  console.log("Connecting to Magento GraphQL using native fetch...");
  const start = Date.now();
  try {
    const res = await fetch(MAGENTO_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000)
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response text length:", text.length);
    console.log("Time taken:", Date.now() - start, "ms");
  } catch (err) {
    console.error("Connection Error:", err);
  }
}

testConnection();
