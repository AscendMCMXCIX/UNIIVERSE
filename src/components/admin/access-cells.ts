/*
  Access levels and groups (Admin → Users & Permissions → Access levels) as cells on their panel's own
  surface (Release 19, the visual review's V3: they were bordered cards inside the bordered panel, two
  insets on a phone): one column, two from md, three from xl, a hairline over every row but the first.
  In a module without "use client", so the server page reads the strings themselves (a value imported
  from a client module into a server component is a client reference, not the value).
*/
export const ACCESS_CELLS = "grid grid-cols-1 gap-x-6 md:grid-cols-2 xl:grid-cols-3";
export const ACCESS_CELL = "min-w-0 border-t border-border/60 py-3 first:border-t-0 first:pt-0 md:[&:nth-child(2)]:border-t-0 md:[&:nth-child(2)]:pt-0 xl:[&:nth-child(3)]:border-t-0 xl:[&:nth-child(3)]:pt-0";
