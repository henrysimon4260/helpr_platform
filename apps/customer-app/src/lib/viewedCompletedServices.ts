// In-memory storage for viewed completed services (persists during app session)
let viewedCompletedServices: Set<string> = new Set();

export const markCompletedServiceAsViewed = (serviceId: string): void => {
  viewedCompletedServices.add(serviceId);
};

export const hasViewedCompletedService = (serviceId: string): boolean => {
  return viewedCompletedServices.has(serviceId);
};

export const getViewedCompletedServices = (): string[] => {
  return Array.from(viewedCompletedServices);
};

export const clearViewedCompletedServices = (): void => {
  viewedCompletedServices.clear();
};

