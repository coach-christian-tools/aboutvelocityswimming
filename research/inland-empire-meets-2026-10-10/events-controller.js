/**
 * Copyright: Copyright (c) 2018 Company: TeamUnify, LLC
 *
 * @author Bui The Hoa
 * @version 1.0
 */

(function() {
  'use strict';

  angular.module('SOCalendar.views').controller('TeamEventsController', TeamEventsController);
  TeamEventsController.$inject = [
    '$scope', '$rootScope', '$q', '$timeout', '$stateParams', '$filter', '$location', '$sce',
    'modal', 'Configuration', 'CalendarService', 'DataComposeService', 'TeamEventService', 'gettextCatalog', '$window'
  ];

  function TeamEventsController(
    $scope, $rootScope, $q, $timeout, $stateParams, $filter, $location, $sce,
    modal, Configuration, CalendarService, DataComposeService, TeamEventService, gettextCatalog, $window) {
    $scope.FormatUtil = $window.top.FormatUtil;
    $scope.TeamLocalizer = $window.top.TeamLocalizer;
    $scope.DATE_FORMATS = $window.top.DATE_FORMATS;

    var self = this;
    self.isLoading = false;
    self.dateFilter = {
      datePickerDateFormat: $scope.FormatUtil.javaToMomentFormat($scope.TeamLocalizer.getString($scope.DATE_FORMATS["date_standard"].format)),
      startDate: null,
      endDate: null
    };
    self.notes = null;

    self.eventTypeIsPastAndArchived = eventTypeIsPastAndArchived;
    self.eventTypeIsDeleted = eventTypeIsDeleted;
    self.getNavHyperlink = getNavHyperlink;
    self.getTeamEvents = getTeamEvents;
    self.openEventNotesModal = openEventNotesModal;
    self.isNewlyInvitedTouchPadMeet = isNewlyInvitedTouchPadMeet;
    self.notYetAcceptedTouchPadMeetInvite = notYetAcceptedTouchPadMeetInvite;
    self.undeleteTeamEvent = undeleteTeamEvent;

    $scope.$on(Configuration.Event.RELOAD_CALENDAR, function () {
      getEventNotes();
      getTeamEvents();
    });

    $scope.$watch("options", function(newVal, oldVal) {
      if (!newVal || newVal == oldVal) return;

      $rootScope.eventOptions = newVal;
    });

    (function() {
      console.log("Initializing TeamEventsController ...");

      $rootScope.$watch("selectOptions", function() {
        if ($rootScope.selectOptions && $rootScope.selectOptions.teamTimeZoneId) {
          self.teamTimeZone = $rootScope.selectOptions.teamTimeZoneId;
        }
      });

      $scope.ds = {};
      self.eventType = $stateParams.eventType;

        if(g_team.isUKishTeam || g_team.isEUTeam) {
            self.teamDateFormat = "DD/MM/YYYY";
            self.teamLongDateFormat = "DD MMMM YYYY";
            self.UKDateFormat = true;
        }

      setDefaultDateFilter();
      setLoading(true);
      getTeamEvents();
      getEventNotes();
      openViewModal();
    })();

    function notYetAcceptedTouchPadMeetInvite(teamEvent) {
      if (isNewlyInvitedTouchPadMeet(teamEvent)) {
        var isSuperUser = $rootScope.global.accountInfo.admin_type == 90;
        return isSuperUser;
      } else {
        return true;
      }
    }

    function isNewlyInvitedTouchPadMeet(teamEvent) {
      return teamEvent.touchPadMeetInviteId.value > 0 && teamEvent.touchPadInvitationStatus.value != "Accepted";
    }

    function getNavHyperlink(url, simpleMode) {
      if (simpleMode) {
        return url + "?mode=simple";
      } else {
        return url;
      }
    }

    function openEventNotesModal() {
      modal.open({
        templateUrl : "/v2/calendar/templates/views/modal/event_notes.html",
        size : "lg",
        controller: function($scope, $modalInstance) {
        },
        windowClass : "CalendarModal ModalAuto",
        keyboard: false,
        backdrop: 'static',
      });
    }

    function getEventNotes() {
      TeamEventService.getEventNotes().then(function(response) {
        self.notes = $sce.trustAsHtml(response.data.notes);
      });
    }

    function openViewModal() {
        var eventId = $stateParams.eventId || window.eventId;
        if (eventId) {
            $timeout(function() {
                TeamEventService.openViewModal(eventId, {edit: window.editEventRequested});
            }, 300);
        }
    }

    function setDefaultDateFilter() {
      if (self.eventTypeIsPastAndArchived() || self.eventTypeIsDeleted()) {
        var yesterday = moment().add(-1, "days");
        var endDate = angular.copy(yesterday);
        var startDate = yesterday.subtract(1, 'month');

        self.dateFilter.startDate = startDate.format(self.dateFilter.datePickerDateFormat);
        self.dateFilter.endDate = endDate.format(self.dateFilter.datePickerDateFormat);
      }
    }

    function setLoading(isLoading) {
      self.isLoading = isLoading;
    }

    function eventTypeIsPastAndArchived() {
      return self.eventType == 'past';
    };

    function eventTypeIsDeleted() {
      return self.eventType == 'deleted';
    };

    function getParams(defaultDateFilter) {
      var params = {
        isPastMeet: eventTypeIsPastAndArchived(),
        isDeletedMeet: eventTypeIsDeleted(),
        timezone: moment.tz.guess()
      }

      if (self.eventTypeIsPastAndArchived() || self.eventTypeIsDeleted()) {
        var startDate = moment(self.dateFilter.startDate, self.dateFilter.datePickerDateFormat);
        var endDate = moment(self.dateFilter.endDate, self.dateFilter.datePickerDateFormat);
        if (startDate.isValid() && endDate.isValid()) {
          params.startDate = startDate;
          params.endDate = endDate;
        }
      }

      return params;
    }

    function undeleteTeamEvent(teamEventId) {
      var msg = "<span>Are you sure you want to undelete this event?</span>";
      alertify.confirm(msg, function() {
        TeamEventService.undelete(teamEventId).then(function() {
          getTeamEvents();
        }, function() {
          alertify.error("Failed to undelete event. Please try again.");
        });
      }).set({title: "Undelete Event"}).set("labels", { ok: "YES", cancel: "NO" });
    }

    function getTeamEvents() {
      setLoading(true);

      var configuration, rawData;
      TeamEventService.getConfiguration().then(function(response) {
        configuration = response.data;

        var params = getParams();

        return TeamEventService.getRawData(params);
      }).then(function(response) {
        rawData = response.data;

        var options = {
          configuration: configuration,
          savedViewType: "",
          menus: [],
          singularName: "Team Event",
          pluralName: $scope.TeamLocalizer.getString("Team Events"),
          currentSort: { field: "startDate", isAsc: true, type: "date" }
        };

        DataComposeService.init(rawData, composeRawDataSuccess, composeRawDataError, options);
      });
    };

    function composeRawDataSuccess(res) {
      $timeout(function() {
        $scope.$apply(function() {
          for (var item in res) {
            $scope.ds[item] = res[item];
          }

          $scope.ds.ctrl = self;

          $scope.ds.formatDate = function(date, format, isAllDay) {
            var tz = self.teamTimeZone;
//            var tz = moment.tz.guess();
//            if (isAllDay) tz = self.teamTimeZone;

            return moment(date).tz(tz).format(format);
          };

          $scope.ds.getFormattedDateRange = function(startDate, endDate, format, isAllDay) {
            if (startDate && endDate) {
              var i18nFormat = $scope.TeamLocalizer.getString(format);

              var tz = self.teamTimeZone;
//              var tz = moment.tz.guess();
//              if (isAllDay) tz = self.teamTimeZone;

              if (moment(startDate).isSame(moment(endDate), 'day')) {
                return moment(startDate).tz(tz).format(i18nFormat);
              } else {
                var formatted =
                  moment(startDate).tz(tz).format(i18nFormat) +
                  " - " +
                  moment(endDate).tz(tz).format(i18nFormat)
                return formatted;
              }
            }
          };

          $scope.ds.excerpt = function(html) {
            html = html.replace(/<img[^>]*>/g, "");
            html = $filter('limitTo')(html, 400, 0);

            return $sce.trustAsHtml(html);
          };

          $scope.options = res.configuration;
        });

        setLoading(false);
      }, 100);
    };

    function composeRawDataError(response) {
      console.error("Error composing raw data ...", response);
    };
  }
})();
