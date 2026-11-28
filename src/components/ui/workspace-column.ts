/*
  The one-screen workspace's column classes, in a module of their own so a server component can use them
  (ui/workspace.tsx is a client module: a server component that imports a constant from it gets a client
  reference, not the string). ui/workspace.tsx re-exports it; docs/RESPONSIVE.md, "The frame".
*/

/** The classes of every element between the shell's frame and a workspace section: a flex column the section fills, as wide as the frame. */
export const WS_COLUMN = "ws-host:flex ws-host:w-full ws-host:flex-1 ws-host:flex-col";
