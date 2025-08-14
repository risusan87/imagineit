import { COOKIE_DOMAIN } from '../constants';

/**
 * Sets a cookie with a specified name, value, and expiration.
 * Handles localhost vs. production domain and Secure flag automatically.
 * @param name The name of the cookie.
 * @param value The value of the cookie. Can be string, number, or null.
 * @param days The number of days until the cookie expires.
 */
export function setCookie(name: string, value: string | number | null, days: number) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    
    // If value is null, store the string 'null' to differentiate from an empty string.
    const cookieValue = value === null ? 'null' : String(value);

    // Don't set domain for localhost
    const domain = window.location.hostname === 'localhost' ? '' : `; domain=${COOKIE_DOMAIN}`;
    
    // Use Secure flag only on HTTPS
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';

    document.cookie = `${name}=${cookieValue}${expires}; path=/${domain}; SameSite=Lax${secure}`;
}

/**
 * Gets a cookie by name.
 * @param name The name of the cookie.
 * @returns The cookie value as a string, or null if not found.
 */
export function getCookie(name: string): string | null {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}
