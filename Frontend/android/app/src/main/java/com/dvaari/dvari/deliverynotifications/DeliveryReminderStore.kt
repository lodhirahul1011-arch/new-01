package com.dvaari.dvari.deliverynotifications

import android.content.Context
import android.util.Base64
import android.util.Log

data class DeliveryReminderSpec(
  val scheduleId: String,
  val title: String,
  val scheduledForIso: String,
  val leadMinutes: Int,
)

object DeliveryReminderStore {
  private const val TAG = "DeliveryReminderStore"
  private const val PREFS = "delivery_reminder_store"
  private const val KEY_ENTRIES = "entries"
  private const val SEPARATOR = "|"

  fun save(context: Context, spec: DeliveryReminderSpec) {
    try {
      val entries = entries(context).toMutableSet()
      val nextEntries = entries.filterNot { decode(it)?.scheduleId == spec.scheduleId }.toMutableSet()
      nextEntries.add(encode(spec))
      prefs(context).edit().putStringSet(KEY_ENTRIES, nextEntries).apply()
      Log.i(TAG, "logs.info delivery reminder spec saved scheduleId=${spec.scheduleId}")
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder spec save failed", error)
    }
  }

  fun remove(context: Context, scheduleId: String) {
    try {
      val nextEntries = entries(context)
        .filterNot { decode(it)?.scheduleId == scheduleId }
        .toSet()
      prefs(context).edit().putStringSet(KEY_ENTRIES, nextEntries).apply()
      Log.i(TAG, "logs.info delivery reminder spec removed scheduleId=$scheduleId")
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder spec remove failed", error)
    }
  }

  fun clear(context: Context) {
    try {
      prefs(context).edit().remove(KEY_ENTRIES).apply()
      Log.i(TAG, "logs.info delivery reminder specs cleared")
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder specs clear failed", error)
    }
  }

  fun getAll(context: Context): List<DeliveryReminderSpec> {
    return try {
      val specs = entries(context).mapNotNull(::decode)
      Log.i(TAG, "logs.info delivery reminder specs read count=${specs.size}")
      specs
    } catch (error: Throwable) {
      Log.e(TAG, "logs.error delivery reminder specs read failed", error)
      emptyList()
    }
  }

  private fun entries(context: Context): Set<String> {
    return prefs(context).getStringSet(KEY_ENTRIES, emptySet()).orEmpty()
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun encode(spec: DeliveryReminderSpec): String {
    return listOf(
      encodePart(spec.scheduleId),
      encodePart(spec.title),
      encodePart(spec.scheduledForIso),
      spec.leadMinutes.toString(),
    ).joinToString(SEPARATOR)
  }

  private fun decode(value: String): DeliveryReminderSpec? {
    val parts = value.split(SEPARATOR)
    if (parts.size != 4) return null
    val scheduleId = decodePart(parts[0]) ?: return null
    val title = decodePart(parts[1]) ?: return null
    val scheduledForIso = decodePart(parts[2]) ?: return null
    val leadMinutes = parts[3].toIntOrNull() ?: return null
    return DeliveryReminderSpec(scheduleId, title, scheduledForIso, leadMinutes)
  }

  private fun encodePart(value: String): String =
    Base64.encodeToString(value.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)

  private fun decodePart(value: String): String? =
    runCatching {
      String(Base64.decode(value, Base64.NO_WRAP), Charsets.UTF_8)
    }.getOrNull()
}
