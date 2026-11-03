const url = "https://altalayi-live.btire.com/graphql";

const SCHEMA_QUERY = `
  query IntrospectInputType {
    __type(name: "KleverConfirmOrderRequestInput") {
      name
      inputFields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
            }
          }
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
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error("Error introspecting:", err);
  }
}

run();
