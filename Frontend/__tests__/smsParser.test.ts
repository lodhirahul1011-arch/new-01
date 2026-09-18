import {parseDeliverySMS} from '../src/utils/smsParser';

describe('parseDeliverySMS', () => {
  it('handles non-object input safely', () => {
    expect(parseDeliverySMS([null, undefined, 123, {}, {body: null}])).toEqual(
      [],
    );
  });

  it('matches otp messages and detects company case-insensitively', () => {
    const results = parseDeliverySMS([
      {body: 'Your AMAZON delivery OTP is 482911. Share it only at doorstep.'},
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.company).toBe('Amazon');
  });

  it('extracts tracking id from labeled patterns', () => {
    const results = parseDeliverySMS([
      {body: 'Shipment update: AWB: AB12CD3456 is out for delivery.'},
    ]);

    expect(results[0]?.trackingId).toBe('AB12CD3456');
  });

  it('matches parcel tracking id messages', () => {
    const results = parseDeliverySMS([
      {body: 'Parcel update: tracking id ZX98YU1234 has reached your hub.'},
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.trackingId).toBe('ZX98YU1234');
  });

  it('matches plain delivery messages without otp awb or tracking id', () => {
    const results = parseDeliverySMS([
      {body: 'Your Amazon order is out for delivery today.'},
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.company).toBe('Amazon');
  });

  it('ignores non-delivery chat messages', () => {
    const results = parseDeliverySMS([
      {body: 'Hi bhai kal milte hain aur chai peete hain.'},
    ]);

    expect(results).toEqual([]);
  });

  it('ignores bank or login otp messages without delivery context', () => {
    const results = parseDeliverySMS([
      {body: 'Your OTP for login is 482911. Do not share it with anyone.'},
      {body: 'Bank OTP 918271 for transaction verification.'},
      {
        body: 'Your delivery via bank transfer of Rs 5000 is processing. OTP: 5678',
      },
    ]);

    expect(results).toEqual([]);
  });

  it('matches amazon delivery messages with track id otp and awb', () => {
    const results = parseDeliverySMS([
      {
        body: 'Your Amazon order is out for delivery. Track ID: ABCD1234 otp:123456 awb:12912091902',
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.company).toBe('Amazon');
    expect(results[0]?.trackingId).toBe('ABCD1234');
  });

  it('matches myntra replacement delivery messages', () => {
    const results = parseDeliverySMS([
      {
        body: 'Out for Delivery (Replacement): SOJANYA Band Collar Straigh... with tracking ID MYSP1359524008 from Myntra will be delivered on successful pickup verification, today by an EKART Wish Master.',
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.company).toBe('Myntra');
    expect(results[0]?.trackingId).toBe('MYSP1359524008');
  });

  it('matches ekart otp shipment updates', () => {
    const results = parseDeliverySMS([
      {
        body: 'Ekart Update: OTP 673141 for your shipment Google Pixel 9A GA09585-IN with tracking id FMPP3531235241. Share the OTP only after checking for damages.',
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.company).toBe('Ekart');
    expect(results[0]?.trackingId).toBe('FMPP3531235241');
  });

  it('matches xpressbees rider messages with awb and otp', () => {
    const results = parseDeliverySMS([
      {
        body: 'XB Rider (8873141466) is waiting at your address to deliver your order from AJIO AWB: 1367062680046, OTP - 653070. XpressBees',
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.company).toBe('Xpressbees');
    expect(results[0]?.trackingId).toBe('1367062680046');
  });

  it('matches delivery updates with tracking ids and no otp', () => {
    const results = parseDeliverySMS([
      {
        body: 'Arriving Soon from Savana: S011260121122220055005. Hey Devika Dawar your order is out for delivery and will reach you today.',
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.company).toBe('Savana');
    expect(results[0]?.trackingId).toBe('S011260121122220055005');
  });
});
