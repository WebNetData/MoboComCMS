/** Runs before hydration so first-time visitors get their device-timezone default. */
export const deviceLocaleBootstrap = `(() => {
  try {
    const cookie = (name) => document.cookie.split('; ').find(part => part.startsWith(name + '='))?.slice(name.length + 1);
    if (cookie('lang_source') === 'manual') return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const preferred = zone === 'Asia/Tehran' || zone === 'Asia/Teheran' || zone === 'Iran' ? 'fa' : 'en';
    if (cookie('lang_source') !== 'auto' || cookie('lang') !== preferred) {
      document.cookie = 'lang=' + preferred + ';path=/;max-age=31536000;SameSite=Lax';
      document.cookie = 'lang_source=auto;path=/;max-age=31536000;SameSite=Lax';
      if (cookie('lang_source') === 'auto' && document.documentElement.lang !== preferred) location.replace(location.href);
    }
  } catch (_) { /* English remains the safe default when timezone detection is unavailable. */ }
})()`
