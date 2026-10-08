export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: { email?: string } | undefined;
};

export type PassengerTabParamList = {
  PassengerHome: undefined;
  PassengerTrip: undefined;
  PassengerHistory: undefined;
  PassengerProfile: undefined;
};

export type PassengerStackParamList = {
  PassengerTabs: undefined;
  TripDetail: { serviceId: string };
  TripTracking: { serviceId: string };
  ReportIncident: { serviceId: string };
};

export type DriverTabParamList = {
  DriverHome: undefined;
  DriverRoutes: undefined;
  DriverActive: undefined;
  DriverProfile: undefined;
};

export type DriverStackParamList = {
  DriverTabs: undefined;
  RouteDetail: { serviceId: string };
  PrepareService: { serviceId: string };
  ActiveRoute: { serviceId: string };
  DriverReportIncident: { serviceId?: string };
};
