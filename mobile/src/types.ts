export type Route = { name: string; params?: Record<string, any> };
export type ScreenProps = {
  route: Route;
  navigate: (name: string, params?: Record<string, any>) => void;
  session: any;
  refreshSession: () => Promise<void>;
};
