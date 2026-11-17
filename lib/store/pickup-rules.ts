// "Pickup from Warehouse" (Magento carrier storepickup) without warehouse / pickup details.
//
// Per the Magento team's checkout specification: on these websites (Magento website_code, read
// from storeConfig for the selected store view) Magento's checkout takes Pickup from Warehouse
// with no warehouse, pickup date, time or pickup person — the customer goes straight to payment.
// Every other website keeps the warehouse flow. Magento's API has no per-website flag for this
// yet; when it adds one, this list should be replaced by that flag.
export const PICKUP_WITHOUT_DETAILS_WEBSITES: readonly string[] = ["afaq"];

/** true = warehouse + pickup details are taken; false = skip them; null = website not known yet. */
export function pickupNeedsDetails(websiteCode: string | null | undefined): boolean | null {
    if (!websiteCode) return null;
    return !PICKUP_WITHOUT_DETAILS_WEBSITES.includes(websiteCode);
}
