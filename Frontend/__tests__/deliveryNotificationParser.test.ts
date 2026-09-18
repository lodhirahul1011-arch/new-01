import {parseDeliveryNotificationText} from '../src/services/notifications/deliveryNotificationParser';

describe('parseDeliveryNotificationText', () => {
  it('extracts delivery fields from an out-for-delivery notification', () => {
    const result = parseDeliveryNotificationText({
      title: 'AM-Amazon',
      body: 'Your Amazon order AB12CD3456 is out for delivery today by 9 PM.',
      postedAt: new Date('2026-08-16T09:00:00+05:30'),
    });

    expect(result).not.toBeNull();
    expect(result?.merchantName).toBe('Amazon');
    expect(result?.productTitle).toBe('');
    expect(result?.orderTrackingId).toBe('AB12CD3456');
    expect(result?.deliveryStatus).toBe('out_for_delivery');
    expect(result?.deliveryTimeWindow).toBe('By 9 PM');
    expect(result?.needsConfirmation).toBe(false);
  });

  it('extracts product title from delivery availability notification body', () => {
    const result = parseDeliveryNotificationText({
      title: 'Flipkart',
      body: '🚚 *Delivery Update: Confirm Your Availability for KAJARU Men Cargo Shorts:Shorts* Great news! We’re ready to deliver your order. For a smooth delivery experience, confirm your availability to *collect the order today* between 7 am - 11 pm 👇',
      postedAt: new Date('2026-08-16T09:00:00+05:30'),
    });

    expect(result).not.toBeNull();
    expect(result?.merchantName).toBe('Flipkart');
    expect(result?.productTitle).toBe('KAJARU Men Cargo Shorts:Shorts');
    expect(result?.deliveryStatus).toBe('scheduled');
    expect(result?.deliveryTimeWindow).toBe('7 AM - 11 PM');
  });

  it('requires confirmation when date or time is missing', () => {
    const result = parseDeliveryNotificationText({
      title: 'Messages',
      body: 'Shipment AWB: ZXCV123456 has been scheduled.',
      postedAt: new Date('2026-08-16T09:00:00+05:30'),
    });

    expect(result).not.toBeNull();
    expect(result?.needsConfirmation).toBe(true);
  });

  it('ignores non-delivery notifications', () => {
    const result = parseDeliveryNotificationText({
      title: 'Messages',
      body: 'Your login OTP is 123456.',
    });

    expect(result).toBeNull();
  });
});
