package fr.nutrisemaine.compagnon

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.LocalDateTime

/** Envoie hier et aujourd'hui (pas, calories) à l'adresse d'import. Planifié toutes les 6 h + à l'ouverture. */
class SyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = Prefs(applicationContext)
        val url = prefs.importUrl ?: return@withContext Result.success()
        if (!HealthReader.available(applicationContext)) return@withContext Result.retry()
        return@withContext try {
            val today = LocalDate.now()
            val days = JSONArray().apply {
                put(HealthReader.dayJson(applicationContext, today.minusDays(1)))
                put(HealthReader.dayJson(applicationContext, today))
            }
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000; readTimeout = 15000
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
            conn.outputStream.use { it.write(days.toString().toByteArray()) }
            val code = conn.responseCode
            val body = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.readText() ?: ""
            prefs.lastSent = LocalDateTime.now().toString()
            prefs.lastResult = "HTTP $code ${body.take(160)}"
            if (code in 200..299) Result.success() else if (code == 401) Result.failure() else Result.retry()
        } catch (e: Exception) {
            prefs.lastResult = "Erreur : ${e.message}"
            Result.retry()
        }
    }
}
