export type DeliveryFilterType = 'upcoming' | 'delivered' | 'rejected';

export type DeliveryRecord = {
  id: string;
  type: DeliveryFilterType;
  title: string;
  orderId: string;
  date: string;
  time: string;
  verificationCode: string;
  productImage: any;
  heroImage: any;
  partnerName: string;
  partnerCompany: 'Flipkart' | 'Amazon';
  partnerRating: string;
  partnerService: string;
  companyName: string;
  payment: string;
  paymentAccent: 'green' | 'red' | 'default';
  otp: string;
  historyLabel: string;
  isLive: boolean;
  price?: string;
  reason?: string;
};

export const deliveryRecords: DeliveryRecord[] = [
  {
    id: 'upcoming-1',
    type: 'upcoming',
    title: 'Dell Laitute Laptop',
    orderId: 'Order #FK-2891',
    date: 'Nov 26,2025',
    time: '2:34 PM',
    verificationCode: 'VRF- 8492',
    productImage: require('../../../assets/images/delivery-history/product-1.png'),
    heroImage: require('../../../assets/images/delivery-approved/product.png'),
    partnerName: 'Ramesh Kumar',
    partnerCompany: 'Flipkart',
    partnerRating: '-',
    partnerService: 'Delhivery',
    companyName: 'Delhivery',
    payment: 'Already Paid',
    paymentAccent: 'green',
    otp: '9805',
    historyLabel: 'Upcoming delivery',
    isLive: true,
  },
  {
    id: 'upcoming-2',
    type: 'upcoming',
    title: 'Sumsung Galaxy S24 ulta',
    orderId: 'Order #AMZ-7654',
    date: 'Nov 26,2025',
    time: '2:34 PM',
    verificationCode: 'VRF- 8201',
    productImage: require('../../../assets/images/delivery-history/product-1.png'),
    heroImage: require('../../../assets/images/delivery-approved/product.png'),
    partnerName: 'Priya shamra',
    partnerCompany: 'Amazon',
    partnerRating: '-',
    partnerService: 'Delhivery',
    companyName: 'Amazon Logistics',
    payment: 'Already Paid',
    paymentAccent: 'green',
    otp: '5721',
    historyLabel: 'Upcoming delivery',
    isLive: true,
  },
  {
    id: 'delivered-1',
    type: 'delivered',
    title: 'Boat Airdopes 311 Pro',
    orderId: 'Order #FLP-1924',
    date: 'Nov 21,2025',
    time: '11:12 AM',
    verificationCode: 'VRF- 6408',
    productImage: require('../../../assets/images/delivery-history/product-2.png'),
    heroImage: require('../../../assets/images/delivery-approved/product.png'),
    partnerName: 'Ankit Verma',
    partnerCompany: 'Flipkart',
    partnerRating: '-',
    partnerService: 'Delhivery',
    companyName: 'Delhivery',
    payment: 'Already Paid',
    paymentAccent: 'green',
    otp: '6408',
    historyLabel: 'Delivered package',
    isLive: false,
  },
  {
    id: 'rejected-1',
    type: 'rejected',
    title: 'Wrong Item - Plastation 5',
    orderId: 'Order #FK-7654',
    date: 'Nov 19,2025',
    time: '2:34 PM',
    verificationCode: '...',
    productImage: require('../../../assets/images/delivery-history/product-2.png'),
    heroImage: require('../../../assets/images/delivery-approved/product.png'),
    partnerName: 'Ramesh Kumar',
    partnerCompany: 'Flipkart',
    partnerRating: '-',
    partnerService: 'Delhivery',
    companyName: 'Delhivery',
    payment: 'Refund in process',
    paymentAccent: 'red',
    otp: '0000',
    historyLabel: 'Rejected delivery',
    isLive: false,
    price: 'Rs 24,999',
    reason: 'wrong item delivered',
  },
];

export function getDeliveryRecordById(id: string) {
  return deliveryRecords.find(item => item.id === id);
}
