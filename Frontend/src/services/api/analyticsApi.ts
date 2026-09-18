import {authApi} from './authApi';

export type AnalyticsCategoryKey = 'all' | 'business' | 'household' | 'personal' | 'other';

export type AnalyticsMonthlyReport = {
  month: string;
  monthLabel: string;
  availableMonths: Array<{
    key: string;
    label: string;
  }>;
  selectedCategory: AnalyticsCategoryKey | string;
  totalDeliveries: number;
  successful: number;
  rejected: number;
  comparison: {
    previousMonth: string;
    previousMonthLabel: string;
    previousTotal: number;
    changeCount: number;
    changePercentage: number;
  };
  categories: Array<{
    key: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  filters: {
    availableCategories: Array<{
      key: string;
      label: string;
    }>;
  };
  byFamilyMember: Array<{
    memberId: string;
    name: string;
    count: number;
  }>;
  securityInsights: {
    approvedDeliveries: number;
    videoRecordingsSaved: number;
    codPaymentsTracked: number;
    businessReceiptsGenerated: number;
  };
  deliveryDetails: Array<{
    id: string;
    date: string;
    dateLabel: string;
    status: string;
    statusLabel: string;
    category: string;
    title: string;
    orderId: string;
    awbNumber: string;
    referenceId: string;
    company: string;
    customerName: string;
    partnerName: string;
    verificationCode: string;
    paymentStatus: string;
    rating?: number | null;
  }>;
  expenseReports: {
    pdfUrl: string;
    excelUrl: string;
    whatsappShareUrl: string;
    whatsappText: string;
    whatsappDeepLink: string;
  };
};

export const analyticsApi = authApi.injectEndpoints({
  endpoints: builder => ({
    getAnalyticsMonthlyReport: builder.query<
      AnalyticsMonthlyReport,
      {month: string; category?: string}
    >({
      query: ({month, category}) => ({
        url: '/api/v1/analytics/monthly-report',
        method: 'GET',
        params: category && category !== 'all' ? {month, category} : {month},
      }),
      transformResponse: (response: {
        ok: boolean;
        data: AnalyticsMonthlyReport;
      }) => response.data,
    }),

    getAnalyticsWhatsappShare: builder.query<
      {
        whatsappText: string;
        whatsappDeepLink: string;
        summary: AnalyticsMonthlyReport;
      },
      {month: string; category?: string}
    >({
      query: ({month, category}) => ({
        url: '/api/v1/analytics/share/whatsapp',
        method: 'GET',
        params: category && category !== 'all' ? {month, category} : {month},
      }),
      transformResponse: (response: {
        ok: boolean;
        data: {
          whatsappText: string;
          whatsappDeepLink: string;
          summary: AnalyticsMonthlyReport;
        };
      }) => response.data,
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAnalyticsMonthlyReportQuery,
  useLazyGetAnalyticsWhatsappShareQuery,
} = analyticsApi;
