// features/players/PlayerDetailModal.jsx - ISPRAVLJENA VERZIJA
import { useEffect, useState } from "react";
import {
  X,
  User,
  Calendar,
  MapPin,
  Ruler,
  Target,
  TrendingUp,
  Clock,
  Award,
  BarChart3,
  Activity,
} from "lucide-react";
import supabase from "../../services/supabase";

const PlayerDetailModal = ({ player, onClose }) => {
  const [matchStats, setMatchStats] = useState([]); // PROMJENA: playerStats -> matchStats
  const [recentMatches, setRecentMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Null safety check
  if (!player) {
    console.log("PlayerDetailModal: No player provided");
    return null;
  }

  useEffect(() => {
    if (player?.id) {
      fetchDetailedData();
    }
  }, [player?.id]);

  const fetchDetailedData = async () => {
    setLoading(true);
    try {
      console.log("Fetching detailed data for player:", player.full_name);

      // Dohvati statistike igrača iz vaše player_stats tablice
      const { data: statsData, error: statsError } = await supabase
        .from("player_stats")
        .select(
          `
          id,
          player_id,
          match_id,
          goals,
          assists,
          shots_total,
          shots_on_target,
          passes,
          tackles,
          rating,
          minutes_played,
          touches,
          is_substitute,
          was_subbed_in,
          was_subbed_out,
          created_at
        `
        )
        .eq("player_id", player.id)
        .order("created_at", { ascending: false })
        .limit(15);

      if (statsError) {
        console.error("Stats query error:", statsError);
      } else {
        console.log("Stats fetched:", statsData?.length || 0, "records");
        setMatchStats(statsData || []); // PROMJENA: playerStats -> matchStats

        // Dohvati podatke o utakmicama ako imamo match_id-ove
        if (statsData && statsData.length > 0) {
          const matchIds = statsData
            .map((stat) => stat.match_id)
            .filter(Boolean);

          if (matchIds.length > 0) {
            const { data: matchesData, error: matchesError } = await supabase
              .from("matches")
              .select(
                `
                id,
                home_team,
                away_team,
                home_score,
                away_score,
                start_time,
                competition,
                status
              `
              )
              .in("id", matchIds)
              .order("start_time", { ascending: false });

            if (!matchesError && matchesData) {
              console.log("Matches fetched:", matchesData.length);
              setRecentMatches(matchesData);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching player details:", error);
    } finally {
      setLoading(false);
    }
  };

  // Enhanced position + grouping logic (aligned with hook)
  const getPositionInfo = (raw) => {
    if (!raw || typeof raw !== "string") {
      return { name: "Unknown", group: "UNK", color: "text-gray-400" };
    }
    const p = raw.toUpperCase();

    // Detailed label map
    const specific = {
      GK: "Goalkeeper",
      G: "Goalkeeper",
      CB: "Centre Back",
      CBR: "Centre Back Right",
      CBL: "Centre Back Left",
      LB: "Left Back",
      RB: "Right Back",
      RWB: "Right Wing Back",
      LWB: "Left Wing Back",
      CDM: "Defensive Midfielder",
      DM: "Defensive Midfielder",
      CM: "Central Midfielder",
      CAM: "Attacking Midfielder",
      AM: "Attacking Midfielder",
      RW: "Right Winger",
      LW: "Left Winger",
      ST: "Striker",
      CF: "Centre Forward",
      SS: "Second Striker",
      FW: "Forward",
      FWD: "Forward",
      MF: "Midfielder",
      MID: "Midfielder",
      DF: "Defender",
      DEF: "Defender",
      D: "Defender",
      M: "Midfielder",
      F: "Forward",
    };

    // Group sets (same as hook)
    const GROUPS = {
      GK: ["GK", "G"],
      DEF: ["DF", "DEF", "D", "CB", "LB", "RB", "RWB", "LWB", "CBR", "CBL"],
      MID: ["MF", "MID", "M", "CM", "CDM", "CAM", "RM", "LM", "DM", "AM"],
      FOR: ["FW", "FWD", "F", "ST", "CF", "LW", "RW", "SS"],
    };

    const resolveGroup = () => {
      if (GROUPS.GK.includes(p)) return "GK";
      if (GROUPS.DEF.includes(p)) return "DEF";
      if (GROUPS.MID.includes(p)) return "MID";
      if (GROUPS.FOR.includes(p)) return "FOR";
      return "UNK";
    };

    const group = resolveGroup();
    const baseColor = {
      GK: "text-orange-400",
      DEF: "text-blue-400",
      MID: "text-green-400",
      FOR: "text-red-400",
      UNK: "text-gray-400",
    }[group];

    return {
      name: specific[p] || specific[group] || p,
      group,
      color: baseColor,
    };
  };

  // Rating styling logic
  const getRatingStyle = (rating) => {
    if (rating === null || rating === undefined || Number.isNaN(rating)) {
      return {
        wrapper: "bg-gray-700/40 border border-gray-600/40",
        text: "text-gray-300",
        label: "No Rating",
      };
    }
    const r = Number(rating);
    if (r >= 8.0)
      return {
        wrapper:
          "bg-gradient-to-br from-purple-700/30 to-fuchsia-600/30 border border-purple-500/40",
        text: "text-fuchsia-300",
        label: "Excellent",
      };
    if (r >= 7.5)
      return {
        wrapper:
          "bg-gradient-to-br from-emerald-700/30 to-emerald-600/30 border border-emerald-500/40",
        text: "text-emerald-300",
        label: "Very Good",
      };
    if (r >= 7.0)
      return {
        wrapper:
          "bg-gradient-to-br from-green-700/30 to-green-600/30 border border-green-500/40",
        text: "text-green-300",
        label: "Good",
      };
    if (r >= 6.5)
      return {
        wrapper:
          "bg-gradient-to-br from-yellow-600/30 to-amber-600/30 border border-yellow-500/40",
        text: "text-yellow-300",
        label: "Average",
      };
    if (r >= 6.0)
      return {
        wrapper:
          "bg-gradient-to-br from-orange-600/30 to-amber-600/30 border border-orange-500/40",
        text: "text-orange-300",
        label: "Below Avg",
      };
    return {
      wrapper:
        "bg-gradient-to-br from-red-700/30 to-red-600/30 border border-red-500/40",
      text: "text-red-300",
      label: "Poor",
    };
  };

  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    try {
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      return age;
    } catch (e) {
      return null;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (e) {
      return "N/A";
    }
  };

  // Safe extraction of player properties
  const playerName = player.full_name || "Unknown Player";
  const playerPosition = player.position || player.grouped_position;
  const playerNumber = player.number;
  const playerTeam = player.teams;
  const playerNationality = player.nationality;
  const playerHeight = player.height_cm;
  const playerDateOfBirth = player.date_of_birth;
  const seasonStats = player.stats || {}; // PROMJENA: playerStats -> seasonStats

  const positionInfo = getPositionInfo(playerPosition);
  const age = calculateAge(playerDateOfBirth);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-white/20">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-red-950/50 to-red-900/50 p-6 border-b border-white/20">
          <div className="flex items-start gap-6 justify-between">
            <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center">
              <User className="w-10 h-10 text-red-400" />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-white mb-2">
                {playerName}
              </h1>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <span className={`${positionInfo.color} font-semibold`}>
                    {positionInfo.name}
                  </span>
                  {playerNumber && (
                    <span className="bg-white/10 px-2 py-1 rounded text-white font-bold">
                      #{playerNumber}
                    </span>
                  )}
                </div>
                {playerTeam && (
                  <div className="flex items-center space-x-2 text-gray-300">
                    {playerTeam.logo_url && (
                      <img
                        src={playerTeam.logo_url}
                        alt={playerTeam.name || 'Team'}
                        className="w-5 h-5 object-contain rounded-sm border border-white/10 bg-white/5"
                        onError={(e)=>{ e.currentTarget.style.display='none'; }}
                      />
                    )}
                    <span>
                      {playerTeam.name || playerTeam.short_name || 'Unknown Team'}
                    </span>
                  </div>
                )}
                {age && (
                  <div className="flex items-center space-x-2 text-gray-300">
                    <Calendar className="w-4 h-4" />
                    <span>{age} years old</span>
                  </div>
                )}
                {playerNationality && (
                  <div className="flex items-center space-x-2 text-gray-300">
                    <MapPin className="w-4 h-4" />
                    <span>{playerNationality}</span>
                  </div>
                )}
                {playerHeight && (
                  <div className="flex items-center space-x-2 text-gray-300">
                    <Ruler className="w-4 h-4" />
                    <span>{playerHeight}cm</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 ml-4">
              <button
                onClick={onClose}
                className="self-end p-2 hover:bg-white/10 rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6 text-white" />
              </button>
              {(() => {
                const rating = seasonStats.rating;
                const style = getRatingStyle(rating);
                return (
                  <div className={`px-4 py-3 rounded-xl ${style.wrapper} min-w-[120px]`}> 
                    <div className="text-center space-y-1">
                      <div className={`text-2xl font-bold tabular-nums ${style.text}`}>
                        {rating && rating > 0 ? rating.toFixed(1) : "—"}
                      </div>
                      <div className={`text-[10px] tracking-wide uppercase font-semibold ${style.text}`}>
                        {style.label}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/20">
          {[
            { id: "overview", name: "Overview", icon: BarChart3 },
            { id: "stats", name: "Statistics", icon: Activity },
            { id: "matches", name: "Recent Matches", icon: Clock },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-6 py-4 transition-colors ${
                activeTab === tab.id
                  ? "bg-red-500/20 text-red-400 border-b-2 border-red-500"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full"></div>
              <span className="ml-3 text-gray-400">
                Loading player details...
              </span>
            </div>
          ) : (
            <>
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Season Statistics */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                      <Award className="w-5 h-5 text-yellow-400" />
                      <span>Season Statistics</span>
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-black/20 rounded-lg p-4 text-center">
                        <Target className="w-6 h-6 text-red-400 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-white">
                          {seasonStats?.goals || 0}
                        </div>
                        <div className="text-sm text-gray-400">Goals</div>
                      </div>

                      <div className="bg-black/20 rounded-lg p-4 text-center">
                        <TrendingUp className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-white">
                          {seasonStats?.assists || 0}
                        </div>
                        <div className="text-sm text-gray-400">Assists</div>
                      </div>

                      <div className="bg-black/20 rounded-lg p-4 text-center">
                        <Activity className="w-6 h-6 text-green-400 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-white">
                          {seasonStats?.games || 0}
                        </div>
                        <div className="text-sm text-gray-400">Games</div>
                      </div>

                      <div className="bg-black/20 rounded-lg p-4 text-center">
                        <Clock className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-white">
                          {seasonStats?.minutes
                            ? Math.round(seasonStats.minutes / 60)
                            : 0}
                          h
                        </div>
                        <div className="text-sm text-gray-400">Played</div>
                      </div>
                    </div>
                  </div>

                  {/* Performance Ratios */}
                  {seasonStats?.games > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4">
                        Performance Ratios
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-black/20 rounded-lg p-4">
                          <div className="text-lg font-semibold text-red-400">
                            {seasonStats.goalsPerGame || 0} goals per game
                          </div>
                          <div className="text-sm text-gray-400">
                            Goal scoring frequency
                          </div>
                        </div>

                        <div className="bg-black/20 rounded-lg p-4">
                          <div className="text-lg font-semibold text-blue-400">
                            {seasonStats.assistsPerGame || 0} assists per game
                          </div>
                          <div className="text-sm text-gray-400">
                            Playmaking contribution
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "stats" && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Match by Match Statistics
                  </h3>

                  {matchStats.length > 0 ? ( // PROMJENA: playerStats -> matchStats
                    <div className="space-y-4">
                      {matchStats.slice(0, 10).map((stat, index) => {
                        // PROMJENA
                        const matchInfo = recentMatches.find(
                          (m) => m.id === stat.match_id
                        );

                        return (
                          <div
                            key={index}
                            className="bg-black/20 rounded-lg p-4"
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <div className="font-semibold text-white">
                                  {matchInfo
                                    ? `${matchInfo.home_team} ${
                                        matchInfo.home_score || 0
                                      } - ${matchInfo.away_score || 0} ${
                                        matchInfo.away_team
                                      }`
                                    : "Match Details N/A"}
                                </div>
                                <div className="text-sm text-gray-400">
                                  {matchInfo
                                    ? formatDate(matchInfo.start_time)
                                    : formatDate(stat.created_at)}
                                  {matchInfo?.competition &&
                                    ` • ${matchInfo.competition}`}
                                </div>
                              </div>
                              {stat.rating && (
                                <div className="bg-yellow-500/20 px-2 py-1 rounded text-yellow-400 font-bold">
                                  {stat.rating}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-3 md:grid-cols-7 gap-4 text-sm">
                              <div>
                                <div className="text-white font-semibold">
                                  {stat.goals || 0}
                                </div>
                                <div className="text-gray-400">Goals</div>
                              </div>
                              <div>
                                <div className="text-white font-semibold">
                                  {stat.assists || 0}
                                </div>
                                <div className="text-gray-400">Assists</div>
                              </div>
                              <div>
                                <div className="text-white font-semibold">
                                  {stat.shots_total || 0}
                                </div>
                                <div className="text-gray-400">Shots</div>
                              </div>
                              <div>
                                <div className="text-white font-semibold">
                                  {stat.shots_on_target || 0}
                                </div>
                                <div className="text-gray-400">On Target</div>
                              </div>
                              <div>
                                <div className="text-white font-semibold">
                                  {stat.passes || 0}
                                </div>
                                <div className="text-gray-400">Passes</div>
                              </div>
                              <div>
                                <div className="text-white font-semibold">
                                  {stat.tackles || 0}
                                </div>
                                <div className="text-gray-400">Tackles</div>
                              </div>
                              <div>
                                <div className="text-white font-semibold">
                                  {stat.minutes_played || 0}'
                                </div>
                                <div className="text-gray-400">Minutes</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No match statistics available</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "matches" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Recent Matches
                  </h3>

                  {recentMatches.length > 0 ? (
                    <div className="space-y-3">
                      {recentMatches.slice(0, 10).map((match, index) => {
                        const matchStat = matchStats.find(
                          // PROMJENA: playerStats -> matchStats
                          (stat) => stat.match_id === match.id
                        );

                        return (
                          <div
                            key={index}
                            className="bg-black/20 rounded-lg p-4"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-semibold text-white">
                                  {match.home_team} {match.home_score || 0} -{" "}
                                  {match.away_score || 0} {match.away_team}
                                </div>
                                <div className="text-sm text-gray-400">
                                  {match.competition || "Competition N/A"} •{" "}
                                  {formatDate(match.start_time)}
                                </div>
                              </div>

                              {matchStat && ( // PROMJENA: matchStats -> matchStat
                                <div className="flex space-x-4 text-sm">
                                  {matchStat.goals > 0 && (
                                    <span className="text-red-400 font-semibold">
                                      G: {matchStat.goals}
                                    </span>
                                  )}
                                  {matchStat.assists > 0 && (
                                    <span className="text-blue-400 font-semibold">
                                      A: {matchStat.assists}
                                    </span>
                                  )}
                                  {matchStat.rating && (
                                    <span className="text-yellow-400 font-semibold">
                                      R: {matchStat.rating}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No recent matches available</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerDetailModal;
