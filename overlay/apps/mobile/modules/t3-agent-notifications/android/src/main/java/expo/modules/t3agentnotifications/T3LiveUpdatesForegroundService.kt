package expo.modules.t3agentnotifications

import android.app.Notification
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * Lightweight Foreground Service (dataSync) that keeps T3 Frosted Glass's local
 * Live Updates bridge alive ONLY while at least one agent is actively working.
 *
 * Uses the exact promoted Android 16/17 Live Update notification built by
 * [AgentNotifications] on ID [ACTIVITY_ID] with `tag = null` so there is never
 * a duplicate "Syncing in background" notification.
 */
class T3LiveUpdatesForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val tickRunnable = object : Runnable {
    override fun run() {
      if (!shouldStayRunning) return
      tickListener?.invoke()
      handler.postDelayed(this, TICK_INTERVAL_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instanceRef = WeakReference(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = pendingNotification ?: buildFallbackNotification(this)
    val attached = attachForeground(notification)
    if (!attached || !shouldStayRunning) {
      running = false
      handler.removeCallbacks(tickRunnable)
      ServiceCompat.stopForeground(
        this,
        if (detachOnStop) ServiceCompat.STOP_FOREGROUND_DETACH else ServiceCompat.STOP_FOREGROUND_REMOVE
      )
      stopSelf(startId)
      return START_NOT_STICKY
    }
    running = true
    // Remove any tagged copy left behind from a non-FGS fallback so only one card exists.
    getSystemService(NotificationManager::class.java)?.cancel(TAG_ACTIVITY, ACTIVITY_ID)
    handler.removeCallbacks(tickRunnable)
    handler.postDelayed(tickRunnable, TICK_INTERVAL_MS)
    return START_NOT_STICKY
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    // Android 15+ enforces a rolling time limit on dataSync foreground services.
    // Detach the Live Update card gracefully and exit cleanly without crashing.
    shouldStayRunning = false
    detachOnStop = true
    running = false
    handler.removeCallbacks(tickRunnable)
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
    stopSelf(startId)
  }

  override fun onDestroy() {
    handler.removeCallbacks(tickRunnable)
    running = false
    if (instanceRef.get() === this) {
      instanceRef = WeakReference(null)
    }
    super.onDestroy()
  }

  private fun attachForeground(notification: Notification): Boolean {
    return try {
      val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      } else {
        0
      }
      ServiceCompat.startForeground(this, ACTIVITY_ID, notification, serviceType)
      true
    } catch (_: Throwable) {
      false
    }
  }

  companion object {
    internal const val ACTIVITY_ID = 73001
    private const val TAG_ACTIVITY = "t3-agent-activity"
    private const val ACTIVITY_CHANNEL = "agent-activity"
    private const val TICK_INTERVAL_MS = 5_000L

    @Volatile
    private var instanceRef: WeakReference<T3LiveUpdatesForegroundService> = WeakReference(null)

    @Volatile
    private var pendingNotification: Notification? = null

    @Volatile
    private var shouldStayRunning: Boolean = false

    @Volatile
    private var detachOnStop: Boolean = false

    @Volatile
    private var running: Boolean = false

    @Volatile
    private var tickListener: (() -> Unit)? = null

    fun isRunning(): Boolean = running

    fun setTickListener(listener: (() -> Unit)?) {
      tickListener = listener
    }

    /**
     * Starts or updates the foreground service using [notification].
     *
     * Returns `true` when the notification is owned by the foreground service slot
     * (`tag = null`, `id = [ACTIVITY_ID]`), or `false` if the OS disallowed starting a
     * foreground service (e.g. cold background restriction on Android 12+), in which case
     * the caller should fall back to standard `NotificationManager.notify(tag, id, n)`.
     */
    @Synchronized
    fun startOrUpdate(context: Context, notification: Notification): Boolean {
      pendingNotification = notification
      shouldStayRunning = true
      detachOnStop = false

      if (running && instanceRef.get() != null) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return false
        manager.cancel(TAG_ACTIVITY, ACTIVITY_ID)
        manager.notify(ACTIVITY_ID, notification)
        return true
      }

      val appContext = context.applicationContext ?: context
      val intent = Intent(appContext, T3LiveUpdatesForegroundService::class.java)
      return try {
        ContextCompat.startForegroundService(appContext, intent)
        true
      } catch (_: Throwable) {
        shouldStayRunning = false
        false
      }
    }

    /**
     * Stops the foreground service while keeping the notification visible (for terminal
     * "Done" / "Failed" cards that remain promoted briefly after work ends).
     *
     * Returns `true` if a foreground service was active and detached onto the untagged slot.
     */
    @Synchronized
    fun stopDetaching(context: Context): Boolean {
      val wasActive = running || shouldStayRunning
      shouldStayRunning = false
      detachOnStop = true
      val service = instanceRef.get()
      if (service != null) {
        service.handler.removeCallbacks(service.tickRunnable)
        running = false
        ServiceCompat.stopForeground(service, ServiceCompat.STOP_FOREGROUND_DETACH)
        service.stopSelf()
        return true
      }
      if (wasActive) {
        running = false
        val appContext = context.applicationContext ?: context
        runCatching { appContext.stopService(Intent(appContext, T3LiveUpdatesForegroundService::class.java)) }
      }
      return wasActive
    }

    /** Stops the foreground service and removes its notification immediately. */
    @Synchronized
    fun stopRemoving(context: Context) {
      val wasActive = running || shouldStayRunning
      shouldStayRunning = false
      detachOnStop = false
      pendingNotification = null
      val service = instanceRef.get()
      if (service != null) {
        service.handler.removeCallbacks(service.tickRunnable)
        running = false
        ServiceCompat.stopForeground(service, ServiceCompat.STOP_FOREGROUND_REMOVE)
        service.stopSelf()
      } else {
        running = false
        if (wasActive) {
          val appContext = context.applicationContext ?: context
          runCatching { appContext.stopService(Intent(appContext, T3LiveUpdatesForegroundService::class.java)) }
        }
      }
      if (wasActive) {
        context.getSystemService(NotificationManager::class.java)?.cancel(ACTIVITY_ID)
      }
    }

    private fun buildFallbackNotification(context: Context): Notification {
      return NotificationCompat.Builder(context, ACTIVITY_CHANNEL)
        .setSmallIcon(R.drawable.agent_activity_mark)
        .setContentTitle("T3 Code")
        .setContentText("Working")
        .setOngoing(true)
        .setSilent(true)
        .setColorized(false)
        .setRequestPromotedOngoing(true)
        .setShortCriticalText("Working")
        .build()
    }
  }
}
