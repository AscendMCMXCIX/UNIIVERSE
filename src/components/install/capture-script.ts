/*
  The browser's install signals, caught before the app's own code loads (the root layout inlines
  CAPTURE_INSTALL_SCRIPT at the top of <head>; install-state.ts reads what it kept). A plain module,
  not a client one, so the server layout gets the script itself.
*/

/** Fired on window whenever the install offer or the installed flag changes. */
export const INSTALL_CHANGE = "uniiverse:install-change";

/**
 * Keeps the browser's install offer for the app's own Install button (preventDefault stops
 * Chrome's automatic install banner on Android, which would otherwise pop up uninvited) and notes
 * an install made from this tab, whichever way it was made.
 */
export const CAPTURE_INSTALL_SCRIPT = `(function(){var w=window,f=function(){w.dispatchEvent(new Event("${INSTALL_CHANGE}"))};w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w.__installPrompt=e;f()});w.addEventListener("appinstalled",function(){w.__installPrompt=null;w.__appInstalled=true;f()})})();`;
