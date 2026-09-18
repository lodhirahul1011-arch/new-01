import { AxiosInstance } from 'axios';

export interface SmsMessage {
  _id: string;
  rawText: string;
  senderPhone: string;
  deliveryCompany: string;
  status: string;
  referenceId: string;
  extractedData: {
    riderName?: string;
    riderPhone?: string;
    customerName?: string;
    otpCode?: string;
    orderHint?: string;
    expectedDeliveryDate?: string;
    deliveryTimeWindow?: string;
    productInfo?: string;
    sellerName?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
  };
  createdAt: string;
}

export interface DeliverySchedule {
  _id: string;
  source?: 'sms' | 'manual' | 'notification' | 'integration' | 'ecommerce' | 'tablet' | string;
  scheduleGroupId: string;
  referenceId: string;
  deliveryCompany: string;
  currentStatus: 'initiated' | 'arriving_soon' | 'out_for_delivery' | 'upon_arrival' | 'delivered' | 'failed';
  statusHistory?: Array<{
    status: 'initiated' | 'arriving_soon' | 'out_for_delivery' | 'upon_arrival' | 'delivered' | 'failed' | string;
    updatedAt: string;
    smsId?: string | null;
    messageSummary?: string;
  }>;
  arrivedByTablet?: boolean;
  activeTabletDeliverySessionId?: string | null;
  activeTabletDeliverySessionAt?: string | null;
  customerName: string;
  riderName?: string;
  riderPhone?: string;
  otpCode?: string;
  orderHint?: string;
  awbNumber?: string;
  verificationMethod?: 'none' | 'nfc' | 'app';
  sellerName?: string;
  productSummary?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  receiverAddress?: string;
  expectedDeliveryDate?: string;
  deliveryTimeWindow?: string;
  scheduledAt?: string;
  confirmationRequired?: boolean;
  confirmedAt?: string | null;
  notificationSourcePackage?: string;
  notificationEventCount?: number;
  reminderLeadMinutes?: number;
  latestNotificationEventId?: string | null;
  smsCount: number;
  latestSmsId?: {
    _id?: string;
    rawText?: string;
    status?: string;
    extractedData?: {
      riderName?: string;
      riderPhone?: string;
      customerName?: string;
      awbNumber?: string;
      otpCode?: string;
      orderHint?: string;
      expectedDeliveryDate?: string;
      deliveryTimeWindow?: string;
      productInfo?: string;
      sellerName?: string;
      receiverAddress?: string;
      imageUrl?: string;
      thumbnailUrl?: string;
    };
  } | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  rating?: number | null;
  ratingComment?: string;
  ratedAt?: string | null;
}

export interface PaginationData {
  skip: number;
  limit: number;
  total: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  pagination?: PaginationData;
}

class SmsDeliveryService {
  private apiClient: AxiosInstance;

  constructor(apiClient: AxiosInstance) {
    this.apiClient = apiClient;
  }

  /**
   * Receive and process SMS
   */
  async receiveSms(smsText: string, senderPhone?: string, messageId?: string) {
    try {
      const response = await this.apiClient.post<ApiResponse<{
        smsId: string;
        company: string;
        status: string;
        scheduleUpdated: boolean;
        scheduleId?: string;
        confidence: number;
      }>>('/sms/receive', {
        smsText,
        senderPhone,
        messageId,
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get upcoming deliveries
   */
  async getUpcomingDeliveries(skip = 0, limit = 50) {
    try {
      const response = await this.apiClient.get<ApiResponse<DeliverySchedule[]>>('/sms/deliveries/upcoming', {
        params: { skip, limit },
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get delivery history
   */
  async getDeliveryHistory(skip = 0, limit = 50) {
    try {
      const response = await this.apiClient.get<ApiResponse<DeliverySchedule[]>>('/sms/deliveries/history', {
        params: { skip, limit },
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get single delivery details
   */
  async getDeliveryDetails(scheduleId: string) {
    try {
      const response = await this.apiClient.get<ApiResponse<DeliverySchedule>>(
        `/sms/deliveries/${scheduleId}`
      );

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get SMS messages for a delivery
   */
  async getScheduleMessages(scheduleId: string, skip = 0, limit = 50) {
    try {
      const response = await this.apiClient.get<ApiResponse<SmsMessage[]>>(
        `/sms/deliveries/${scheduleId}/messages`,
        {
          params: { skip, limit },
        }
      );

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Search deliveries
   */
  async searchDeliveries(
    referenceId?: string,
    company?: string,
    skip = 0,
    limit = 50
  ) {
    try {
      const response = await this.apiClient.get<ApiResponse<DeliverySchedule[]>>(
        '/sms/deliveries/search',
        {
          params: {
            referenceId,
            company,
            skip,
            limit,
          },
        }
      );

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get SMS statistics
   */
  async getStats() {
    try {
      const response = await this.apiClient.get<ApiResponse<{
        totalSms: number;
        statistics: {
          upcoming: number;
          delivered: number;
          failed: number;
        };
        byCompany: Record<string, number>;
      }>>('/sms/stats');

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Mark delivery as completed
   */
  async markDelivered(scheduleId: string) {
    try {
      const response = await this.apiClient.patch<ApiResponse<DeliverySchedule>>(
        `/sms/deliveries/${scheduleId}/mark-delivered`
      );

      return response.data;
    } catch (error) {
      throw error;
    }
  }
}

export default SmsDeliveryService;
