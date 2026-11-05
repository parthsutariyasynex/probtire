// Shapes returned by the Klever_SiteLogin GraphQL API (client + server safe).

export type SiteLoginAccount = {
    account_id: number;
    name: string | null;
    current?: boolean | null;
    website_id: number | null;
    website_code: string | null;
    label: string | null;
    logo: string | null;
    store_code: string | null;
    store_url: string | null;
};

export type SiteLoginVerifyResult = {
    login_key: string;
    accounts: SiteLoginAccount[];
};




