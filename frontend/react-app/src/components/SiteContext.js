import { createContext, useContext } from 'react';
import { FALLBACK } from '../data/fallback.js';

/** The club's name and contact details, as the backend currently holds them. */
export const SiteContext = createContext(FALLBACK.site);

export function useSite() {
  return useContext(SiteContext);
}
