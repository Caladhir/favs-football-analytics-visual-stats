// src/hooks/useMatchesByDate.js
import { useEffect, useState } from "react";
import supabase from "/src/services/supabase.js";
import { startOfDay, endOfDay } from "date-fns";

export default function useMatchesByDate(date) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      const from = startOfDay(date).toISOString();
      const to = endOfDay(date).toISOString();

      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .gte("start_time", from)
        .lt("start_time", to)
        .order("start_time", { ascending: true });

      if (error) console.error(error);
      else setMatches(data);
      setLoading(false);
    };

    fetchMatches();
  }, [date]);

  return { matches, loading };
}
