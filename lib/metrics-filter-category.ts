const gymTypes = new Set(["Open", "Personal training gym", "Group training gym", "Specialty gym/studio"]);
const equipmentFilters = new Set(["Squat rack", "Power rack", "Smith machine", "Bench press", "Deadlift platform", "Olympic lifting platform", "Hack squat", "Pendulum squat", "Belt squat", "Leg press", "Cable station", "Pec deck", "Hip thrust machine", "Dumbbells 120+ lb"]);
const amenityFilters = new Set(["Sauna", "Steam room", "Pool", "Showers", "Locker rooms", "Basketball court", "Turf area", "Group classes", "Personal training", "Childcare", "Parking", "24/7 access", "Women's-only area"]);

export function filterCategory(metadata: unknown): string | null {
  const data = metadata as Record<string, unknown> | null;
  const control = typeof data?.control === "string" ? data.control : "";
  const filter = typeof data?.filter === "string" ? data.filter : "";
  return control === "Distance" ? "Distance" : control === "Day-pass price" ? "Day-pass price" : control === "Membership price" ? "Membership price" : control === "Equipment" ? "Equipment" : control === "Amenities" ? "Amenities" : gymTypes.has(filter) ? "Gym type" : equipmentFilters.has(filter) ? "Equipment" : amenityFilters.has(filter) ? "Amenities" : null;
}
