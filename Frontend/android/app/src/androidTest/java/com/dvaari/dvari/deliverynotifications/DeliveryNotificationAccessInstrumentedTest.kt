package com.dvaari.dvari.deliverynotifications

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.ZoneId

@RunWith(AndroidJUnit4::class)
class DeliveryNotificationAccessInstrumentedTest {
  private val context: Context = ApplicationProvider.getApplicationContext()

  @Test
  fun featureTogglePersistsWithoutSmsPermission() {
    DeliveryNotificationPrefs.setFeatureEnabled(context, true)
    assertTrue(DeliveryNotificationPrefs.isFeatureEnabled(context))

    DeliveryNotificationPrefs.setFeatureEnabled(context, false)
    assertFalse(DeliveryNotificationPrefs.isFeatureEnabled(context))
  }

  @Test
  fun notificationAccessCheckReturnsBoolean() {
    val enabled = DeliveryNotificationPrefs.isNotificationAccessEnabled(context)
    assertNotNull(enabled)
  }

  @Test
  fun reminderDelayUsesLeadTime() {
    val now = 1_000_000L
    val scheduledFor = now + 90 * 60_000L
    val delay = DeliveryReminderScheduler.calculateInitialDelayMillis(
      nowMillis = now,
      scheduledForMillis = scheduledFor,
      leadMinutes = 30,
    )

    assertEquals(60 * 60_000L, delay)
  }

  @Test
  fun reminderStoreKeepsOnlySchedulingMetadata() {
    DeliveryReminderStore.clear(context)
    DeliveryReminderStore.save(
      context,
      DeliveryReminderSpec(
        scheduleId = "test-schedule",
        title = "Upcoming delivery",
        scheduledForIso = "2026-08-16T15:30:00Z",
        leadMinutes = 30,
      ),
    )

    val reminders = DeliveryReminderStore.getAll(context)
    assertEquals(1, reminders.size)
    assertEquals("test-schedule", reminders.first().scheduleId)
    assertEquals("2026-08-16T15:30:00Z", reminders.first().scheduledForIso)
    assertEquals(30, reminders.first().leadMinutes)
  }

  @Test
  fun parserRequiresConfirmationWhenTimeIsMissing() {
    val parsed = DeliveryNotificationParser.parse(
      title = "AM-Amazon",
      body = "Your Amazon order AB12CD3456 is arriving today.",
      postedAtMillis = 1_787_000_000_000L,
      zoneId = ZoneId.of("Asia/Calcutta"),
    )

    assertNotNull(parsed)
    assertTrue(parsed!!.needsConfirmation)
  }
}
