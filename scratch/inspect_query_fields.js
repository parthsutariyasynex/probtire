const url = "https://altalayi-live.btire.com/graphql";

const SCHEMA_QUERY = `
  query IntrospectQuery {
    __schema {
      queryType {
        fields {
          name
        }
      }
    }
  }
`;

async function run() {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: SCHEMA_QUERY }),
    });
    const json = await res.json();
    const fields = json?.data?.__schema?.queryType?.fields || [];
    const names = fields.map(f => f.name);
    console.log("Query fields containing 'klever':", names.filter(n => n.toLowerCase().includes("klever")));
  } catch (err) {
    console.error("Error introspecting:", err);
  }
}

run();
