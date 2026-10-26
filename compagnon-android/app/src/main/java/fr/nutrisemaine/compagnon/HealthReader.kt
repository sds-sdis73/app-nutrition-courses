package fr.nutrisemaine.compagnon

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Lit les totaux d'une journée dans Health Connect (toutes montres confondues) et les met au format attendu par import-activite. */
object HealthReader {
    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    )

    fun available(context: Context): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    suspend fun dayJson(context: Context, day: LocalDate): JSONObject {
        val client = HealthConnectClient.getOrCreate(context)
        val zone = ZoneId.systemDefault()
        val start = day.atStartOfDay(zone).toInstant()
        val end = day.plusDays(1).atStartOfDay(zone).toInstant()
        val range = TimeRangeFilter.between(start, end)
        val agg = client.aggregate(
            AggregateRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, TotalCaloriesBurnedRecord.ENERGY_TOTAL, DistanceRecord.DISTANCE_TOTAL, ExerciseSessionRecord.EXERCISE_DURATION_TOTAL),
                timeRangeFilter = range,
            )
        )
        return JSONObject().apply {
            put("date", day.format(DateTimeFormatter.ISO_LOCAL_DATE))
            put("source", "health-connect")
            agg[StepsRecord.COUNT_TOTAL]?.let { put("steps", it) }
            agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { put("active_kcal", it.inKilocalories) }
            agg[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.let { put("total_kcal", it.inKilocalories) }
            agg[DistanceRecord.DISTANCE_TOTAL]?.let { put("distance_m", it.inMeters) }
            agg[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.let { put("exercise_min", it.toMinutes()) }
        }
    }
}
