package fr.nutrisemaine.compagnon

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/**
 * Écran unique : état de l'appairage, autorisations Health Connect, dernier envoi.
 * Appairage sans saisie : l'app web ouvre nutrisemaine://pair?t=JETON (ou l'utilisateur colle l'adresse).
 */
class MainActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private val importBase = "https://svugddkrptqpjmywhorb.supabase.co/functions/v1/import-activite?t="

    private val permissionLauncher = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        if (granted.containsAll(HealthReader.PERMISSIONS)) { schedule(); syncNow() }
        refresh()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)
        handleIntent(intent)
        findViewById<Button>(R.id.btnPermissions).setOnClickListener { askPermissions() }
        findViewById<Button>(R.id.btnSync).setOnClickListener { syncNow() }
        findViewById<Button>(R.id.btnSave).setOnClickListener {
            val raw = findViewById<EditText>(R.id.inputUrl).text.toString().trim()
            val token = Regex("[?&]t=([A-Za-z0-9_-]{20,64})").find(raw)?.groupValues?.get(1) ?: raw.takeIf { it.matches(Regex("[A-Za-z0-9_-]{20,64}")) }
            if (token != null) { prefs.importUrl = importBase + token; askPermissions() }
            refresh()
        }
        refresh()
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); handleIntent(intent); refresh() }

    private fun handleIntent(intent: Intent?) {
        val uri: Uri = intent?.data ?: return
        if (uri.scheme == "nutrisemaine" && uri.host == "pair") {
            uri.getQueryParameter("t")?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{20,64}")) }?.let {
                prefs.importUrl = importBase + it
                askPermissions()
            }
        }
    }

    private fun askPermissions() {
        if (!HealthReader.available(this)) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")))
            return
        }
        lifecycleScope.launch {
            val granted = HealthConnectClient.getOrCreate(this@MainActivity).permissionController.getGrantedPermissions()
            if (granted.containsAll(HealthReader.PERMISSIONS)) { schedule(); syncNow() } else permissionLauncher.launch(HealthReader.PERMISSIONS)
        }
    }

    private fun schedule() {
        val periodic = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("nutri-sync", ExistingPeriodicWorkPolicy.UPDATE, periodic)
    }

    private fun syncNow() {
        WorkManager.getInstance(this).enqueueUniqueWork("nutri-sync-now", ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<SyncWorker>().build())
        findViewById<TextView>(R.id.status).postDelayed({ refresh() }, 4000)
    }

    private fun refresh() {
        val paired = prefs.importUrl != null
        findViewById<TextView>(R.id.status).text = when {
            !HealthReader.available(this) -> "Health Connect n'est pas installé sur ce téléphone."
            !paired -> "Non appairé. Ouvrez Nutri Semaine › Paramètres › Montres & activité › « Lier ce téléphone Android »."
            else -> "Appairé ✓\nDernier envoi : ${prefs.lastSent ?: "jamais"}\n${prefs.lastResult ?: ""}"
        }
        findViewById<Button>(R.id.btnSync).isEnabled = paired
    }
}
