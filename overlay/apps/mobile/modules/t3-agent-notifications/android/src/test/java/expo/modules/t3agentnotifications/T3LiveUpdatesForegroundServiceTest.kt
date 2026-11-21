package expo.modules.t3agentnotifications

import android.app.Notification
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.lifecycle.Lifecycle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 36], manifest = Config.NONE)
class T3LiveUpdatesForegroundServiceTest : AgentNotificationsFixture() {
  private fun localPayload(
    active: Boolean,
    phase: String,
    status: String,
    alertId: String? = null,
    expiresAt: Long = System.currentTimeMillis() + 900_000L,
  ): Map<String, String> = buildMap {
    put("t3_kind", "agent_activity")
    put("device_id", "device")
    put("user_id", "user")
    put("updated_at", System.currentTimeMillis().toString())
    put("active", active.toString())
    put("activity_chip", if (active) "Active" else "")
    put("activity_title", if (active) "1 active agent" else "Agent work completed")
    put("activity_phase", phase)
    put("activity_active_count", if (active) "1" else "0")
    put("activity_attention_count", if (phase == "waiting_for_approval") "1" else "0")
    put("activity_body", "$status: Build Live Bridge · t3-android")
    put("activity_line_0", "$status\tBuild Live Bridge\tt3-android")
    put("activity_path", "/threads/env-1/thread-1")
    put("activity_expires_at", expiresAt.toString())
    if (alertId != null) {
      put("alert_id", alertId)
      put("alert_group", "[\"env-1\",\"thread-1\"]")
      put("alert_title", "Build Live Bridge")
      put("alert_body", "$status: t3-android")
      put("alert_path", "/threads/env-1/thread-1")
    }
  }

  @Test
  fun localBridgePromotesActiveNotificationAndClearsOnDismiss() {
    lifecycle.currentState = Lifecycle.State.CREATED
    val serviceController = Robolectric.buildService(T3LiveUpdatesForegroundService::class.java).create()

    AgentNotifications.receiveLocal(context, localPayload(active = true, phase = "running", status = "Working"))

    val startedIntent = shadowOf(context).nextStartedService
    assertEquals(T3LiveUpdatesForegroundService::class.java.name, startedIntent?.component?.className)
    serviceController.withIntent(startedIntent).startCommand(0, 1)
    assertTrue(T3LiveUpdatesForegroundService.isRunning())

    val fgNotification = shadowOf(serviceController.get()).lastForegroundNotification
    assertEquals("Build Live Bridge", fgNotification.extras.getString(Notification.EXTRA_TITLE))
    assertTrue(fgNotification.flags and Notification.FLAG_ONGOING_EVENT != 0)
    assertTrue(NotificationCompat.isRequestPromotedOngoing(fgNotification))
    assertEquals("Working", fgNotification.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT))

    // Second active update updates the existing foreground slot without duplicating cards.
    AgentNotifications.receiveLocal(
      context,
      localPayload(active = true, phase = "waiting_for_approval", status = "Approval", alertId = "approval-1")
    )
    val activeCards = manager.activeNotifications.filter { it.id == 73001 }
    assertEquals(1, activeCards.size)
    assertEquals("Approve", activeCards.single().notification.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT))
    assertTrue(manager.activeNotifications.any { it.tag == "t3-agent-alert" })

    // Dismissing stops the foreground service and clears the activity card.
    AgentNotifications.dismiss(context)
    assertFalse(T3LiveUpdatesForegroundService.isRunning())
    assertTrue(manager.activeNotifications.none { it.id == 73001 })
    serviceController.destroy()
  }

  @Test
  fun localBridgeDetachesServiceOnTerminalCardAndExpiresCleanly() {
    lifecycle.currentState = Lifecycle.State.RESUMED
    AgentNotifications.setThreadOnScreen("/threads/env-1/thread-1")
    val serviceController = Robolectric.buildService(T3LiveUpdatesForegroundService::class.java).create()

    AgentNotifications.receiveLocal(context, localPayload(active = true, phase = "running", status = "Working"))
    val startedIntent = shadowOf(context).nextStartedService
    serviceController.withIntent(startedIntent).startCommand(0, 1)
    assertTrue(T3LiveUpdatesForegroundService.isRunning())

    // Transition to completed (alert suppressed because thread is on screen -> finished card stays).
    AgentNotifications.receiveLocal(
      context,
      localPayload(active = false, phase = "completed", status = "Done", alertId = "done-1")
    )
    assertFalse(T3LiveUpdatesForegroundService.isRunning())
    val terminalCards = manager.activeNotifications.filter { it.id == 73001 }
    assertEquals(1, terminalCards.size)
    assertEquals(
      if (Build.VERSION.SDK_INT >= 36) "Done" else null,
      terminalCards.single().notification.extras.getString(NotificationCompat.EXTRA_SHORT_CRITICAL_TEXT)
    )

    // Expiring payload removes the finished card completely.
    AgentNotifications.receiveLocal(
      context,
      localPayload(
        active = false,
        phase = "completed",
        status = "Done",
        expiresAt = System.currentTimeMillis() - 1000L
      )
    )
    assertTrue(manager.activeNotifications.none { it.id == 73001 })
    serviceController.destroy()
  }
}
