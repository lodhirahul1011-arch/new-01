package com.dvaari.dvari.deliverynotifications

import android.util.Log
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.Month
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.regex.Pattern

data class ParsedDeliveryNotification(
  val merchantName: String,
  val productTitle: String,
  val courierName: String,
  val orderTrackingId: String,
  val deliveryDateIso: String,
  val deliveryTimeWindow: String,
  val deliveryStatus: String,
  val needsConfirmation: Boolean,
  val confidence: Int,
  val keywordMatches: List<String>,
)

object DeliveryNotificationParser {
  private const val TAG = "DeliveryNotifParser"
  private val whitespace = Regex("\\s+")
  private val zeroWidth = Regex("[\\u200B-\\u200D\\u2060\\uFEFF]")
  private val knownCompanies = listOf(
    "Amazon",
    "Flipkart",
    "Myntra",
    "Ekart",
    "Shadowfax",
    "Xpressbees",
    "Delhivery",
    "Blue Dart",
    "DTDC",
    "Ecom Express",
    "Shiprocket",
    "FedEx",
    "DHL",
    "India Post",
    "Ajio",
    "Nykaa",
    "Meesho",
    "Savana",
    "Tira",
    "Zara",
    "Blinkit",
    "Zepto",
    "BigBasket",
  )
  private val monthNames = mapOf(
    "jan" to Month.JANUARY,
    "january" to Month.JANUARY,
    "feb" to Month.FEBRUARY,
    "february" to Month.FEBRUARY,
    "mar" to Month.MARCH,
    "march" to Month.MARCH,
    "apr" to Month.APRIL,
    "april" to Month.APRIL,
    "may" to Month.MAY,
    "jun" to Month.JUNE,
    "june" to Month.JUNE,
    "jul" to Month.JULY,
    "july" to Month.JULY,
    "aug" to Month.AUGUST,
    "august" to Month.AUGUST,
    "sep" to Month.SEPTEMBER,
    "sept" to Month.SEPTEMBER,
    "september" to Month.SEPTEMBER,
    "oct" to Month.OCTOBER,
    "october" to Month.OCTOBER,
    "nov" to Month.NOVEMBER,
    "november" to Month.NOVEMBER,
    "dec" to Month.DECEMBER,
    "december" to Month.DECEMBER,
  )

  fun parse(
    title: String?,
    body: String?,
    postedAtMillis: Long,
    zoneId: ZoneId = ZoneId.systemDefault(),
    keywords: List<String> = DeliveryNotificationPrefs.defaultKeywords,
  ): ParsedDeliveryNotification? {
    val safeTitle = clean(title)
    val safeBody = clean(body)
    val combined = listOf(safeTitle, safeBody).filter { it.isNotBlank() }.joinToString(" ")

    if (combined.isBlank()) {
      Log.e(TAG, "logs.error notification body hidden or empty")
      return null
    }

    val matchedKeywords = matchKeywords(combined, keywords)
    if (matchedKeywords.isEmpty()) {
      return null
    }

    val postedDate = Instant.ofEpochMilli(postedAtMillis).atZone(zoneId)
    val merchant = detectCompany(combined, safeTitle)
    val productTitle = extractProductTitle(safeBody, combined, merchant)
    val courier = detectCourier(combined, merchant)
    val referenceId = extractReferenceId(combined)
    val parsedDate = extractDeliveryDate(combined, postedDate)
    val timeWindow = extractTimeWindow(combined)
    val status = inferStatus(combined)
    val deliveryDateIso = formatIso(parsedDate)
    val needsConfirmation =
      parsedDate == null ||
        timeWindow.isBlank() ||
        status == "delivered" ||
        referenceId.isBlank()
    val confidence = computeConfidence(
      matchedKeywords = matchedKeywords,
      merchant = merchant,
      productTitle = productTitle,
      referenceId = referenceId,
      deliveryDateIso = deliveryDateIso,
      timeWindow = timeWindow,
      status = status,
    )

    if (productTitle.isBlank()) {
      Log.e(TAG, "logs.error delivery notification product title missing")
    } else {
      Log.i(TAG, "logs.info delivery notification product title extracted length=${productTitle.length}")
    }
    Log.i(TAG, "logs.info parsed delivery notification confidence=$confidence needsConfirmation=$needsConfirmation")

    return ParsedDeliveryNotification(
      merchantName = merchant,
      productTitle = productTitle,
      courierName = courier,
      orderTrackingId = referenceId,
      deliveryDateIso = deliveryDateIso,
      deliveryTimeWindow = timeWindow,
      deliveryStatus = status,
      needsConfirmation = needsConfirmation,
      confidence = confidence,
      keywordMatches = matchedKeywords,
    )
  }

  fun clean(value: String?): String {
    return value
      .orEmpty()
      .replace(zeroWidth, "")
      .replace('\u00A0', ' ')
      .replace(Regex("[\\u2010-\\u2015]"), "-")
      .replace(whitespace, " ")
      .trim()
  }

  private fun matchKeywords(text: String, keywords: List<String>): List<String> {
    val lower = text.lowercase(Locale.US)
    return keywords
      .map { it.trim().lowercase(Locale.US) }
      .filter { it.isNotBlank() && lower.contains(it) }
      .distinct()
  }

  private fun detectCompany(text: String, title: String): String {
    val known = knownCompanies.firstOrNull { company ->
      val pattern = Regex("\\b${Regex.escape(company).replace("\\ ", "\\s+")}\\b", RegexOption.IGNORE_CASE)
      pattern.containsMatchIn(text)
    }
    if (!known.isNullOrBlank()) return known

    val titleCandidate = title
      .replace(Regex("(?i)^(messages|sms|notification|android system)$"), "")
      .replace(Regex("^[A-Z]{2}-", RegexOption.IGNORE_CASE), "")
      .replace(Regex("[^A-Za-z0-9 &.-]"), " ")
      .replace(whitespace, " ")
      .trim()
    return titleCandidate.takeIf { it.length in 3..40 }.orEmpty()
  }

  private fun detectCourier(text: String, merchant: String): String {
    val courier = knownCompanies.firstOrNull { company ->
      Regex("\\b${Regex.escape(company).replace("\\ ", "\\s+")}\\b", RegexOption.IGNORE_CASE)
        .containsMatchIn(text)
    }.orEmpty()
    return courier.takeIf { it.isNotBlank() && !it.equals(merchant, ignoreCase = true) }.orEmpty()
  }

  private fun extractProductTitle(body: String, text: String, merchant: String): String {
    val searchTexts = listOf(body, text).filter { it.isNotBlank() }
    val patterns = listOf(
      Pattern.compile(
        "\\b(?:confirm\\s+your\\s+availability\\s+for|availability\\s+for)\\s+(.+?)(?=\\s*[*_]*\\s*(?:great\\s+news\\b|we(?:'|’|\\s+a)re\\b|ready\\s+to\\s+deliver\\b|for\\s+a\\s+smooth\\b|between\\b|today\\b|tomorrow\\b|[.!?]|$))",
        Pattern.CASE_INSENSITIVE,
      ),
      Pattern.compile(
        "\\byour\\s+(.+?)\\s+(?:is|has\\s+been|will\\s+be)\\s+(?:out\\s+for\\s+delivery|ready\\s+to\\s+deliver|arriving|scheduled|delivered)\\b",
        Pattern.CASE_INSENSITIVE,
      ),
      Pattern.compile(
        "\\b(?:product|item|package)\\s*(?:title|name)?\\s*(?:is|:|-)\\s+(.+?)(?=\\s*(?:order\\b|awb\\b|tracking\\b|great\\s+news\\b|between\\b|today\\b|tomorrow\\b|[.!?]|$))",
        Pattern.CASE_INSENSITIVE,
      ),
      Pattern.compile(
        "\\border\\s+for\\s+(.+?)(?=\\s*(?:is|has\\s+been|will\\s+be|great\\s+news\\b|between\\b|today\\b|tomorrow\\b|[.!?]|$))",
        Pattern.CASE_INSENSITIVE,
      ),
    )

    for (source in searchTexts) {
      for (pattern in patterns) {
        val matcher = pattern.matcher(source)
        if (!matcher.find()) continue

        val candidate = sanitizeProductTitle(matcher.group(1), merchant)
        if (candidate.isNotBlank()) {
          Log.i(TAG, "logs.info delivery notification product candidate accepted")
          return candidate
        }
      }
    }

    Log.e(TAG, "logs.error delivery notification product candidate not found")
    return ""
  }

  private fun sanitizeProductTitle(value: String?, merchant: String): String {
    val candidate = clean(value)
      .replace(Regex("[*_`~]+"), " ")
      .replace(Regex("[^\\p{L}\\p{N} &:,./+()\\-]"), " ")
      .replace(Regex("(?i)\\b(?:great\\s+news|ready\\s+to\\s+deliver|confirm\\s+your\\s+availability|collect\\s+the\\s+order)\\b.*$"), "")
      .replace(Regex("(?i)\\b(?:order|awb|tracking|shipment|courier)\\s*(?:id|no|number)?\\b.*$"), "")
      .replace(whitespace, " ")
      .trim(' ', '-', ':', ',', '.', '*', '_')
      .take(120)

    val lower = candidate.lowercase(Locale.US)
    val merchantLower = merchant.lowercase(Locale.US)
    val isGeneric = lower in setOf(
      "delivery",
      "order",
      "your order",
      "package",
      "shipment",
      "item",
      "product",
    )
    val isOnlyCompany = candidate.equals(merchant, ignoreCase = true) ||
      knownCompanies.any { company -> candidate.equals(company, ignoreCase = true) } ||
      (merchantLower.isNotBlank() && lower == "${merchantLower} delivery")

    if (candidate.length < 3 || isGeneric || isOnlyCompany || !Regex("[\\p{L}\\p{N}]").containsMatchIn(candidate)) {
      Log.i(TAG, "logs.info delivery notification product candidate rejected")
      return ""
    }

    Log.i(TAG, "logs.info delivery notification product candidate sanitized length=${candidate.length}")
    return candidate
  }

  private fun extractReferenceId(text: String): String {
    val labeled = Pattern.compile(
      "\\b(?:awb|airway\\s*bill|waybill|tracking(?:\\s*id)?|track(?:ing)?(?:\\s*(?:id|no|number))?|shipment(?:\\s*(?:id|no|number))?|consignment(?:\\s*(?:id|no|number))?|order(?:\\s*(?:id|no|number)|#)?|package(?:\\s*(?:id|no|number))?)\\s*[:#-]?\\s*((?=[A-Z0-9-]{5,}\\b)(?=[A-Z0-9-]*\\d)[A-Z0-9-]+)\\b",
      Pattern.CASE_INSENSITIVE,
    ).matcher(text)
    if (labeled.find()) return sanitizeReference(labeled.group(1))

    val fallback = Pattern.compile("\\b(?=[A-Z0-9-]{8,}\\b)(?=[A-Z0-9-]*\\d)[A-Z0-9-]+\\b", Pattern.CASE_INSENSITIVE)
      .matcher(text)
    while (fallback.find()) {
      val token = sanitizeReference(fallback.group())
      if (token.isNotBlank() && !token.matches(Regex("^\\d{4,8}$"))) return token
    }

    return ""
  }

  private fun sanitizeReference(value: String?): String {
    return clean(value)
      .uppercase(Locale.US)
      .replace(Regex("[^A-Z0-9-]"), "")
      .take(80)
  }

  private fun extractDeliveryDate(text: String, postedAt: ZonedDateTime): ZonedDateTime? {
    val lower = text.lowercase(Locale.US)
    val localDate = when {
      lower.contains("arriving today") || lower.contains("today") -> postedAt.toLocalDate()
      lower.contains("tomorrow") -> postedAt.toLocalDate().plusDays(1)
      else -> extractNumericDate(lower, postedAt.toLocalDate())
        ?: extractMonthDate(lower, postedAt.toLocalDate())
    } ?: return null

    val time = extractStartTime(text) ?: LocalTime.of(9, 0)
    return ZonedDateTime.of(LocalDateTime.of(localDate, time), postedAt.zone)
  }

  private fun extractNumericDate(text: String, baseDate: LocalDate): LocalDate? {
    val matcher = Pattern.compile("\\b(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{2,4}))?\\b").matcher(text)
    if (!matcher.find()) return null
    val day = matcher.group(1)?.toIntOrNull() ?: return null
    val month = matcher.group(2)?.toIntOrNull() ?: return null
    val rawYear = matcher.group(3)?.toIntOrNull()
    val year = when {
      rawYear == null -> baseDate.year
      rawYear < 100 -> 2000 + rawYear
      else -> rawYear
    }
    return runCatching { LocalDate.of(year, month, day) }.getOrNull()
  }

  private fun extractMonthDate(text: String, baseDate: LocalDate): LocalDate? {
    val matcher = Pattern.compile("\\b(\\d{1,2})\\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b").matcher(text)
    if (!matcher.find()) return null
    val day = matcher.group(1)?.toIntOrNull() ?: return null
    val monthToken = matcher.group(2)?.lowercase(Locale.US) ?: return null
    val month = monthNames[monthToken] ?: return null
    val candidate = runCatching { LocalDate.of(baseDate.year, month, day) }.getOrNull() ?: return null
    return if (candidate.isBefore(baseDate.minusDays(1))) candidate.plusYears(1) else candidate
  }

  private fun extractTimeWindow(text: String): String {
    val body = clean(text)
    val range = Pattern.compile(
      "\\b(?:between\\s+)?(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|AM|PM)?)\\s*(?:-|to|and)\\s*(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|AM|PM))\\b",
      Pattern.CASE_INSENSITIVE,
    ).matcher(body)
    if (range.find()) {
      return "${clean(range.group(1)).uppercase(Locale.US)} - ${clean(range.group(2)).uppercase(Locale.US)}"
    }

    val byTime = Pattern.compile("\\b(?:by|before|till|until|valid till)\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|AM|PM))\\b", Pattern.CASE_INSENSITIVE)
      .matcher(body)
    if (byTime.find()) return "By ${clean(byTime.group(1)).uppercase(Locale.US)}"

    return ""
  }

  private fun extractStartTime(text: String): LocalTime? {
    val window = extractTimeWindow(text)
    val first = Regex("(\\d{1,2})(?::(\\d{2}))?\\s*(AM|PM)?", RegexOption.IGNORE_CASE).find(window)
      ?: return null
    val hourRaw = first.groupValues.getOrNull(1)?.toIntOrNull() ?: return null
    val minute = first.groupValues.getOrNull(2)?.toIntOrNull() ?: 0
    val suffix = first.groupValues.getOrNull(3).orEmpty().uppercase(Locale.US)
    val hour = when {
      suffix == "PM" && hourRaw < 12 -> hourRaw + 12
      suffix == "AM" && hourRaw == 12 -> 0
      else -> hourRaw
    }
    return runCatching { LocalTime.of(hour, minute) }.getOrNull()
  }

  private fun inferStatus(text: String): String {
    val lower = text.lowercase(Locale.US)
    return when {
      Regex("\\bout\\s+for\\s+delivery\\b").containsMatchIn(lower) -> "out_for_delivery"
      lower.contains("arriving today") || lower.contains("arriving") -> "arriving_soon"
      lower.contains("ready to deliver") ||
        lower.contains("collect the order") ||
        lower.contains("confirm your availability") -> "scheduled"
      lower.contains("scheduled") || lower.contains("will be delivered") -> "scheduled"
      lower.contains("delivered") -> "delivered"
      lower.contains("failed") || lower.contains("could not deliver") -> "failed"
      else -> "initiated"
    }
  }

  private fun computeConfidence(
    matchedKeywords: List<String>,
    merchant: String,
    productTitle: String,
    referenceId: String,
    deliveryDateIso: String,
    timeWindow: String,
    status: String,
  ): Int {
    var score = 30 + (matchedKeywords.size.coerceAtMost(4) * 5)
    if (merchant.isNotBlank()) score += 10
    if (productTitle.isNotBlank()) score += 10
    if (referenceId.isNotBlank()) score += 20
    if (deliveryDateIso.isNotBlank()) score += 15
    if (timeWindow.isNotBlank()) score += 15
    if (status != "initiated") score += 10
    return score.coerceIn(0, 100)
  }

  fun formatIso(value: ZonedDateTime?): String {
    return value?.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME).orEmpty()
  }
}
