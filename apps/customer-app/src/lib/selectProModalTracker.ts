const shownServiceIds = new Set<string>();

export const hasShownSelectProModal = (serviceId: string): boolean => {
  return shownServiceIds.has(serviceId);
};

export const markSelectProModalShown = (serviceId: string): void => {
  shownServiceIds.add(serviceId);
};

export const resetSelectProModalTracker = (): void => {
  shownServiceIds.clear();
};
