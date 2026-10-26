import Foundation
import HealthKit

/// Lecture des totaux journaliers dans HealthKit, au format attendu par import-activite.
enum Health {
    static let store = HKHealthStore()
    static let types: Set<HKObjectType> = [
        HKQuantityType(.stepCount), HKQuantityType(.activeEnergyBurned), HKQuantityType(.basalEnergyBurned),
        HKQuantityType(.appleExerciseTime), HKQuantityType(.distanceWalkingRunning),
    ]

    static func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        try? await store.requestAuthorization(toShare: [], read: types)
    }

    static func sum(_ id: HKQuantityTypeIdentifier, unit: HKUnit, day: Date) async -> Double? {
        let cal = Calendar.current
        let start = cal.startOfDay(for: day)
        guard let end = cal.date(byAdding: .day, value: 1, to: start) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        return await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: HKQuantityType(id), quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    static func dayPayload(_ day: Date) async -> [String: Any] {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        var d: [String: Any] = ["date": f.string(from: day), "source": "apple-sante"]
        if let v = await sum(.stepCount, unit: .count(), day: day) { d["steps"] = Int(v) }
        if let v = await sum(.activeEnergyBurned, unit: .kilocalorie(), day: day) { d["active_kcal"] = v }
        if let v = await sum(.basalEnergyBurned, unit: .kilocalorie(), day: day) { d["resting_kcal"] = v }
        if let v = await sum(.appleExerciseTime, unit: .minute(), day: day) { d["exercise_min"] = v }
        if let v = await sum(.distanceWalkingRunning, unit: .meter(), day: day) { d["distance_m"] = v }
        return d
    }
}
