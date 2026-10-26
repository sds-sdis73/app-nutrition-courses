package fr.nutrisemaine.compagnon

import android.content.Context

/** Réglages : adresse d'import (jeton) et dernier envoi. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("nutri", Context.MODE_PRIVATE)
    var importUrl: String?
        get() = sp.getString("importUrl", null)
        set(v) = sp.edit().putString("importUrl", v).apply()
    var lastSent: String?
        get() = sp.getString("lastSent", null)
        set(v) = sp.edit().putString("lastSent", v).apply()
    var lastResult: String?
        get() = sp.getString("lastResult", null)
        set(v) = sp.edit().putString("lastResult", v).apply()
}
