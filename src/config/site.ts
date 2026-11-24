/**
 * Business details shown around the site.
 * Empty values are hidden until they're filled in.
 */
export const siteConfig = {
  name: "Arcane Studios",
  /** Full Instagram profile URL, e.g. "https://instagram.com/yourhandle". */
  instagramUrl: "",
  /** WhatsApp number in international format without "+", e.g. "201001234567". */
  whatsappNumber: "201223766447",
  /** Where customers can pick up orders. */
  pickupLocation: { en: "", ar: "" },
  /**
   * Where customers send the deposit. Empty values are hidden, and the order
   * page tells the customer you'll send the details on WhatsApp instead.
   */
  payment: {
    /** InstaPay address, e.g. "arcane@instapay", or the mobile number linked to InstaPay. */
    instapay: "",
    /** Mobile wallet number (Vodafone Cash, Etisalat Cash, Orange Cash…), e.g. "01001234567". */
    wallet: "",
    /** Name on the account, so customers can check they're paying the right person. */
    accountName: "",
  },
};
