const MAGENTO_GRAPHQL = "https://altalayi-live.btire.com/graphql";
const query = `
  query KleverAccountSidebar {
    kleverAccountSidebar {
      user_type
      items {
        code
        label
        url
        is_visible
        sort_order
      }
    }
  }
`;

async function testConnection() {
  console.log("Querying kleverAccountSidebar on Magento...");
  const start = Date.now();
  try {
    const res = await fetch(MAGENTO_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000)
    });
    console.log("Status:", res.status);
    const json = await res.json();
    console.log("Response JSON:", JSON.stringify(json));
    console.log("Time taken:", Date.now() - start, "ms");
  } catch (err) {
    console.error("Connection Error:", err);
  }
}

testConnection();
