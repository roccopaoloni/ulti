// The CSS colour of a Routine Day's accent slot (see `dayColour` in the rules package), for the
// Routine editor's stripe and for History's dot on a Session started from that Day.
export const dayColourVar = (slot: number) => `var(--day-${slot + 1})`;
