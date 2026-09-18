export const logs = {
  info: (message: string, details?: unknown) => {
    if (details === undefined) {
      console.log(message);
      return;
    }
    console.log(message, details);
  },
  error: (message: string, details?: unknown) => {
    if (details === undefined) {
      console.error(message);
      return;
    }
    console.error(message, details);
  },
};
